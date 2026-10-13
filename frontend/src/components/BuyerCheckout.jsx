import React, { useState, useEffect, useRef } from 'react';
import { payOrder } from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { getTranslation, translateField } from '../utils/translations';
import { 
    isPaymentIntent, 
    isHomeIntent, 
    normalizeText,
    isAffirmativeIntent,
    isNegativeIntent 
} from '../utils/voiceMatcher';

export const BuyerCheckout = ({ order, user, language, onComplete, onBack }) => {
    const { 
        setPageContext,
        setScreenInstruction, 
        speak, 
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();
    const t = getTranslation(language);

    // States: 'review' | 'processing' | 'confirmed'
    const [paymentState, setPaymentState] = useState('review');
    const [secondsLeft, setSecondsLeft] = useState(10);
    const [confirmedData, setConfirmedData] = useState(null);
    const [guardrailModal, setGuardrailModal] = useState(false);
    const timerRef = useRef(null);

    // Initial instruction on mount or guardrail change
    useEffect(() => {
        let pageCtx = language === 'ta-IN' ? "செக்அவுட் & கட்டணம் / Checkout & Payment" : "Checkout & Payment";
        if (guardrailModal) {
            pageCtx = language === 'ta-IN' ? "கட்டண உறுதிப்படுத்தல் / Confirm Payment" : "Confirm Payment";
        }
        setPageContext(pageCtx);

        const instruction = guardrailModal
            ? (language === 'ta-IN'
                ? "கட்டணத்தை உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்."
                : "Say 'Yes' to confirm payment or 'No' to cancel.")
            : (language === 'ta-IN'
                ? `பாதுகாப்பான பணம் செலுத்துதல். ${translateField(order.item_title, language)}க்கான கட்டணம் ₹${order.total_amount}. பணம் செலுத்த கீழே உள்ள மைக்கை இரட்டை தட்டி 'பணம்' என்று சொல்லுங்கள்.`
                : `Secure checkout for ${translateField(order.item_title, language)}. Total is ₹${order.total_amount}. Double-tap bottom mic & say 'Pay' to complete payment.`);

        setScreenInstruction(instruction, true);

        // Register voice command for "Pay", "பணம்", Guardrail Yes/No, or "Back" / "Home"
        const handleVoiceCommand = (transcript) => {
            if (!transcript) return;
            const norm = normalizeText(transcript);

            // Guardrail active check
            if (guardrailModal) {
                if (isAffirmativeIntent(norm)) {
                    setGuardrailModal(false);
                    startPayment();
                    return;
                }
                if (isNegativeIntent(norm)) {
                    setGuardrailModal(false);
                    const cancelMsg = language === 'ta-IN' ? "பணம் செலுத்துதல் ரத்து செய்யப்பட்டது." : "Payment cancelled.";
                    speak(cancelMsg, language);
                    return;
                }
                speak(language === 'ta-IN' ? "உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்." : "Say 'Yes' to confirm or 'No' to cancel.", language);
                return;
            }

            if (isHomeIntent(norm)) {
                if (onBack) onBack();
                return;
            }

            if (isPaymentIntent(norm)) {
                initiatePayment();
            }
        };

        registerVoiceHandler(handleVoiceCommand);

        return () => {
            unregisterVoiceHandler();
            setPageContext('');
        };
    }, [order, language, onBack, guardrailModal, setPageContext, setScreenInstruction, registerVoiceHandler, unregisterVoiceHandler, speak]);

    const isPayingRef = useRef(false);

    // Complete payment & advance status in backend
    const completePayment = async () => {
        if (isPayingRef.current) return;
        isPayingRef.current = true;

        try {
            console.log("[Completing Payment]: Calling payOrder for order #", order.order_id);
            const res = await payOrder(order.order_id, user.user_id, language);
            setConfirmedData(res);
            setPaymentState('confirmed');

            // Play celebratory confirmation voice
            if (res.buyer_voice_prompt) {
                speak(res.buyer_voice_prompt, language);
            }
        } catch (err) {
            console.error("Payment API Error:", err);
            isPayingRef.current = false;
            alert(language === 'ta-IN' ? "கட்டணம் செலுத்துவதில் பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்." : "Payment error occurred. Please try again.");
            setPaymentState('review');
        }
    };

    // Dedicated payment countdown effect (Decoupled from voice/modal re-renders)
    useEffect(() => {
        if (paymentState !== 'processing') return;

        console.log("[Payment Processing]: Starting 10-second countdown for order #", order.order_id);
        let currentSec = 10;
        setSecondsLeft(10);

        const timer = setInterval(() => {
            currentSec -= 1;
            setSecondsLeft(Math.max(0, currentSec));

            if (currentSec <= 0) {
                clearInterval(timer);
                completePayment();
            }
        }, 1000);

        return () => {
            clearInterval(timer);
        };
    }, [paymentState]);

    // Step 4 Guardrail: Initiate Payment readback
    const initiatePayment = () => {
        if (paymentState !== 'review') return;
        const prompt = language === 'ta-IN'
            ? `நான் ₹${order.total_amount} கட்டணத்தை ${translateField(order.item_title, language)} பொருளுக்காக செலுத்த உள்ளேன். உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்.`
            : `I am about to process payment of ₹${order.total_amount} for ${translateField(order.item_title, language)}. Say 'Yes' to confirm or 'No' to cancel.`;
        setGuardrailModal(true);
        speak(prompt, language);
    };

    // Start 10-second simulated payment
    const startPayment = () => {
        setGuardrailModal(false);
        isPayingRef.current = false;
        setPaymentState('processing');

        const procAudio = language === 'ta-IN'
            ? "பாதுகாப்பான கட்டணம் செயலாக்கப்படுகிறது... தயவுசெய்து 10 வினாடிகள் காத்திருக்கவும்."
            : "Processing Secure Payment... Please wait 10 seconds.";
        speak(procAudio, language);
    };

    return (
        <div className="w-full max-w-2xl mx-auto flex flex-col items-center p-6 text-white pb-32">
            {/* Header */}
            <div className="w-full flex justify-between items-center mb-6">
                <button
                    onClick={onBack}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 font-bold rounded-xl transition-colors text-sm"
                >
                    ← {language === 'ta-IN' ? "திரும்ப" : "Back"}
                </button>
                <div className="flex items-center gap-2 bg-emerald-900/40 border border-emerald-500/40 px-3 py-1.5 rounded-full text-emerald-300 text-xs font-bold">
                    <span>🛡️</span>
                    <span>{language === 'ta-IN' ? "பாதுகாப்பான பரிவர்த்தனை" : "Bank-Grade Escrow"}</span>
                </div>
            </div>

            {/* ─── STATE 1: ORDER REVIEW & PAY BUTTON ─── */}
            {paymentState === 'review' && (
                <div className="w-full bg-[#0E1A35]/90 border border-slate-700 rounded-3xl p-8 shadow-2xl flex flex-col">
                    <div className="flex justify-between items-start border-b border-slate-700/60 pb-6 mb-6">
                        <div>
                            <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-700/60">
                                {language === 'ta-IN' ? "விற்பனையாளர் ஏற்றுக்கொண்டார்" : "Invitation Accepted"}
                            </span>
                            <h2 className="text-3xl font-black text-white mt-3">{translateField(order.item_title, language)}</h2>
                            <p className="text-gray-400 text-sm mt-1">
                                👨‍🌾 {translateField(order.seller_name, language) || (language === 'ta-IN' ? "விற்பனையாளர்" : "Seller")} • 📍 {translateField(order.seller_village, language) || (language === 'ta-IN' ? "இடம்" : "Location")}
                            </p>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-gray-400">{language === 'ta-IN' ? "அளவு" : "Quantity"}</span>
                            <p className="text-2xl font-bold text-white">{order.quantity} {translateField(order.unit, language)}</p>
                        </div>
                    </div>

                    {/* Price Breakdown */}
                    <div className="bg-[#081022] p-5 rounded-2xl border border-slate-800 space-y-3 mb-8">
                        <div className="flex justify-between text-sm text-gray-400">
                            <span>{language === 'ta-IN' ? "விலை / அலகு" : "Unit Price"}</span>
                            <span>₹{order.unit_price} / {translateField(order.unit, language)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-400">
                            <span>{language === 'ta-IN' ? "தள கட்டணம்" : "Platform Fee (Tribal subsidy)"}</span>
                            <span className="text-emerald-400">{language === 'ta-IN' ? "இலவசம் (₹0)" : "FREE (₹0)"}</span>
                        </div>
                        <div className="border-t border-slate-800 pt-3 flex justify-between items-center">
                            <span className="text-lg font-bold text-white">{language === 'ta-IN' ? "மொத்த தொகை" : "Total Amount"}</span>
                            <span className="text-3xl font-black text-amber-400">₹{order.total_amount}</span>
                        </div>
                    </div>

                    {/* Payment Trigger Button */}
                    <button
                        onClick={initiatePayment}
                        className="w-full py-5 rounded-2xl font-black text-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-[0_0_35px_rgba(16,185,129,0.5)] transform hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer"
                    >
                        <span>🔒</span>
                        <span>{language === 'ta-IN' ? `₹${order.total_amount} பணம் செலுத்துக` : `Pay ₹${order.total_amount} Securely`}</span>
                    </button>
                    <p className="text-center text-xs text-gray-400 mt-4">
                        {language === 'ta-IN' ? "அல்லது மைக்ரோஃபோனில் 'பணம்' என்று சொல்லுங்கள்" : "Or double-tap the mic below and say 'Pay'"}
                    </p>
                </div>
            )}

            {/* ─── STATE 2: 10-SECOND SIMULATED PAYMENT LOADER ─── */}
            {paymentState === 'processing' && (
                <div className="w-full bg-[#0E1A35]/95 border border-cyan-500/50 rounded-3xl p-10 shadow-[0_0_50px_rgba(6,182,212,0.3)] flex flex-col items-center text-center">
                    <div className="relative w-44 h-44 mb-8 flex items-center justify-center">
                        {/* Rotating animated SVG circular track */}
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            <circle
                                cx="50"
                                cy="50"
                                r="42"
                                stroke="currentColor"
                                strokeWidth="8"
                                className="text-slate-800"
                                fill="transparent"
                            />
                            <circle
                                cx="50"
                                cy="50"
                                r="42"
                                stroke="currentColor"
                                strokeWidth="8"
                                className="text-cyan-400 transition-all duration-1000 ease-linear"
                                fill="transparent"
                                strokeDasharray={264}
                                strokeDashoffset={264 - (264 * (10 - secondsLeft)) / 10}
                                strokeLinecap="round"
                            />
                        </svg>

                        {/* Center Seconds Countdown */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-5xl font-black text-cyan-300 font-mono">{secondsLeft}s</span>
                            <span className="text-xs uppercase tracking-widest text-gray-400 mt-1">
                                {language === 'ta-IN' ? "வினாடிகள்" : "Remaining"}
                            </span>
                        </div>
                    </div>

                    <h3 className="text-2xl font-black text-white mb-2 animate-pulse">
                        {language === 'ta-IN' ? "பாதுகாப்பான கட்டணம் செயலாக்கப்படுகிறது..." : "Processing Secure Payment..."}
                    </h3>
                    <p className="text-gray-300 text-sm max-w-md mb-6">
                        {language === 'ta-IN'
                            ? "பரிவர்த்தனை சரிபார்க்கப்படுகிறது. திரையை மூட வேண்டாம்."
                            : "Simulating UPI/Banking verification with Escrow lock. Please do not close this window."}
                    </p>

                    <div className="w-full bg-slate-900/80 rounded-xl p-4 border border-slate-800 flex items-center justify-between text-xs text-gray-400 mb-4">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                            <span>{language === 'ta-IN' ? "வங்கி இணைப்பு நிலை: இணைக்கப்பட்டுள்ளது" : "Gateway: Active"}</span>
                        </div>
                        <span className="font-mono text-cyan-400 font-bold">₹{order.total_amount}</span>
                    </div>

                    <button
                        type="button"
                        onClick={() => completePayment()}
                        className="px-5 py-2.5 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 font-bold rounded-xl text-xs transition-all shadow-lg flex items-center gap-1.5 cursor-pointer"
                    >
                        <span>⚡</span>
                        <span>{language === 'ta-IN' ? "உடனடி உறுதிப்படுத்தல் (Instant Confirm)" : "Instant Confirm & Pay"}</span>
                    </button>
                </div>
            )}

            {/* ─── STATE 3: ORDER CONFIRMED & AMOUNT PAID ─── */}
            {paymentState === 'confirmed' && (
                <div className="w-full bg-[#08182B]/95 border border-emerald-500 rounded-3xl p-8 md:p-10 shadow-[0_0_60px_rgba(16,185,129,0.4)] flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(16,185,129,0.8)] animate-bounce">
                        <span className="text-4xl">✅</span>
                    </div>

                    <span className="bg-emerald-950 text-emerald-300 text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full border border-emerald-600 mb-3">
                        {confirmedData?.order_status || 'payment_completed'}
                    </span>

                    <h2 className="text-3xl font-black text-white mb-1">
                        {language === 'ta-IN' ? "பணம் வெற்றிகரமாக செலுத்தப்பட்டது!" : "Payment Done / Order Processing!"}
                    </h2>
                    <p className="text-emerald-300 text-base font-semibold mb-6">
                        {confirmedData?.status_localized || (language === 'ta-IN' ? "ஆர்டர் உறுதி செய்யப்பட்டு செயலாக்கத்தில் உள்ளது" : "Payment Done • Order Processing")}
                    </p>

                    {/* 5-Stage Live Fulfillment Tracker */}
                    <div className="w-full bg-[#051121] border border-slate-800 rounded-2xl p-5 mb-6 text-left">
                        <p className="text-xs uppercase font-extrabold tracking-widest text-cyan-400 mb-4 text-center">
                            {language === 'ta-IN' ? "ஆர்டர் கண்காணிப்பு நிலை" : "Fulfillment Pipeline"}
                        </p>
                        <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] md:text-xs">
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center mb-1">✓</div>
                                <span className="text-emerald-300 font-bold">{language === 'ta-IN' ? "ஆர்டர் உருவானது" : "Placed"}</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center mb-1">✓</div>
                                <span className="text-emerald-300 font-bold">{language === 'ta-IN' ? "கட்டணம் முடிந்தது" : "Paid"}</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-amber-500/30 border border-amber-400 text-amber-300 font-bold flex items-center justify-center mb-1 animate-pulse">3</div>
                                <span className="text-amber-300">{language === 'ta-IN' ? "பேக்கிங்" : "Packing"}</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-gray-400 flex items-center justify-center mb-1">4</div>
                                <span className="text-gray-400">{language === 'ta-IN' ? "பயணம்" : "Moving"}</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-gray-400 flex items-center justify-center mb-1">5</div>
                                <span className="text-gray-400">{language === 'ta-IN' ? "பெறப்பட்டது" : "Received"}</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full bg-slate-900/80 rounded-2xl p-6 border border-slate-800 text-left mb-8 space-y-3">
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-gray-400 text-sm">{language === 'ta-IN' ? "ஆர்டர் எண்" : "Order ID"}</span>
                            <span className="font-mono font-bold text-white">#{order.order_id}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-gray-400 text-sm">{language === 'ta-IN' ? "பொருள்" : "Item"}</span>
                            <span className="font-bold text-white">{translateField(order.item_title, language)} ({order.quantity} {translateField(order.unit, language)})</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-gray-400 text-sm">{language === 'ta-IN' ? "செலுத்தப்பட்ட தொகை" : "Amount Paid"}</span>
                            <span className="font-bold text-amber-400 text-xl">₹{order.total_amount}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400 text-sm">{language === 'ta-IN' ? "விற்பனையாளர்" : "Producer"}</span>
                            <span className="text-gray-300">{translateField(order.seller_name, language)} {order.seller_phone ? `(${order.seller_phone})` : ''}</span>
                        </div>
                    </div>

                    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={onComplete}
                            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <span>📜</span>
                            <span>{language === 'ta-IN' ? "ஆர்டர் வரலாறு & கண்காணிப்பு" : "View in Order History"}</span>
                        </button>
                        <button
                            onClick={onBack}
                            className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-gray-300 font-bold rounded-2xl transition-all cursor-pointer"
                        >
                            {language === 'ta-IN' ? "முகப்பிற்குத் திரும்பு" : "Back to Home"}
                        </button>
                    </div>
                </div>
            )}

            {/* ─── STEP 4: PAYMENT VOICE CONFIRMATION GUARDRAIL MODAL ─── */}
            {guardrailModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-[#0B152B] border-2 border-amber-400 rounded-3xl p-6 md:p-8 max-w-lg w-full text-center shadow-[0_0_50px_rgba(245,158,11,0.6)] animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 rounded-full bg-amber-400/20 border-2 border-amber-400 text-amber-400 text-3xl flex items-center justify-center mx-auto mb-4">
                            🛡️
                        </div>

                        <h3 className="text-2xl font-black text-white mb-2">
                            {t.guardrailTitle || "Payment Confirmation"}
                        </h3>

                        <div className="bg-[#070F1E] border border-slate-700 rounded-2xl p-4 my-4 text-left space-y-1.5">
                            <p className="text-white font-bold text-base">
                                📦 {translateField(order.item_title, language)} ({order.quantity} {translateField(order.unit, language)})
                            </p>
                            <p className="text-gray-300 text-sm">
                                👨‍🌾 {translateField(order.seller_name, language) || (language === 'ta-IN' ? "விற்பனையாளர்" : "Seller")} • 📍 {translateField(order.seller_village, language) || (language === 'ta-IN' ? "இடம்" : "Location")}
                            </p>
                            <p className="text-amber-400 font-black text-2xl">
                                💰 ₹{order.total_amount}
                            </p>
                        </div>

                        <p className="text-cyan-200 font-bold text-base mb-6 leading-relaxed">
                            {language === 'ta-IN'
                                ? `நான் ₹${order.total_amount} கட்டணத்தை செலுத்த உள்ளேன். உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்.`
                                : `I am about to process payment of ₹${order.total_amount} for ${translateField(order.item_title, language)}. Say 'Yes' to confirm or 'No' to cancel.`}
                            <br />
                            <span className="text-amber-300 text-xs">
                                🎙️ {language === 'ta-IN' ? "உறுதி செய்ய 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்" : "Say 'Yes' to confirm or 'No' to cancel into mic"}
                            </span>
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setGuardrailModal(false);
                                    startPayment();
                                }}
                                className="py-3.5 px-6 rounded-xl font-black text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span>✅</span>
                                <span>{t.confirmYes || "Yes (Pay)"}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setGuardrailModal(false);
                                    const cancelMsg = language === 'ta-IN' ? "பணம் செலுத்துதல் ரத்து செய்யப்பட்டது." : "Payment cancelled.";
                                    speak(cancelMsg, language);
                                }}
                                className="py-3.5 px-6 rounded-xl font-bold text-gray-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span>❌</span>
                                <span>{t.cancelNo || "No (Cancel)"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

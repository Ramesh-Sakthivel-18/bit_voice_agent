import React, { useState, useEffect, useRef } from 'react';
import { payOrder } from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { getTranslation } from '../utils/translations';
import { isPaymentIntent, isHomeIntent, normalizeText } from '../utils/voiceMatcher';

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
    const timerRef = useRef(null);

    // Initial instruction on mount
    useEffect(() => {
        const pageCtx = language === 'ta-IN' ? "செக்அவுட் & கட்டணம் / Checkout & Payment" : "Checkout & Payment";
        setPageContext(pageCtx);

        const instruction = language === 'ta-IN'
            ? `பாதுகாப்பான பணம் செலுத்துதல். ${order.item_title}க்கான கட்டணம் ₹${order.total_amount}. பணம் செலுத்த கீழே உள்ள மைக்கை இரட்டை தட்டி 'பணம்' என்று சொல்லுங்கள்.`
            : `Secure checkout for ${order.item_title}. Total is ₹${order.total_amount}. Double-tap bottom mic & say 'Pay' to complete payment.`;

        setScreenInstruction(instruction, true);

        // Register voice command for "Pay", "பணம்", or "Back" / "Home"
        const handleVoiceCommand = (transcript) => {
            if (!transcript) return;
            const norm = normalizeText(transcript);

            if (isHomeIntent(norm)) {
                if (onBack) onBack();
                return;
            }

            if (isPaymentIntent(norm)) {
                startPayment();
            }
        };

        registerVoiceHandler(handleVoiceCommand);

        return () => {
            unregisterVoiceHandler();
            setPageContext('');
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [order, language, onBack, setPageContext, setScreenInstruction, registerVoiceHandler, unregisterVoiceHandler]);

    // Start 10-second simulated payment
    const startPayment = () => {
        if (paymentState !== 'review') return;

        setPaymentState('processing');
        setSecondsLeft(10);

        const procAudio = language === 'ta-IN'
            ? "பாதுகாப்பான கட்டணம் செயலாக்கப்படுகிறது... தயவுசெய்து 10 வினாடிகள் காத்திருக்கவும்."
            : "Processing Secure Payment... Please wait 10 seconds.";
        speak(procAudio, language);

        let currentSec = 10;
        timerRef.current = setInterval(() => {
            currentSec -= 1;
            setSecondsLeft(currentSec);

            if (currentSec <= 0) {
                clearInterval(timerRef.current);
                completePayment();
            }
        }, 1000);
    };

    // Complete payment & advance status in backend
    const completePayment = async () => {
        try {
            const res = await payOrder(order.order_id, user.user_id, language);
            setConfirmedData(res);
            setPaymentState('confirmed');

            // Play celebratory confirmation voice
            if (res.buyer_voice_prompt) {
                speak(res.buyer_voice_prompt, language);
            }
        } catch (err) {
            console.error("Payment API Error:", err);
            alert("Payment error occurred. Please try again.");
            setPaymentState('review');
        }
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
                            <h2 className="text-3xl font-black text-white mt-3">{order.item_title}</h2>
                            <p className="text-gray-400 text-sm mt-1">
                                👨‍🌾 {order.seller_name || "Seller"} • 📍 {order.seller_village || "Location"}
                            </p>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-gray-400">{language === 'ta-IN' ? "அளவு" : "Quantity"}</span>
                            <p className="text-2xl font-bold text-white">{order.quantity} {order.unit}</p>
                        </div>
                    </div>

                    {/* Price Breakdown */}
                    <div className="bg-[#081022] p-5 rounded-2xl border border-slate-800 space-y-3 mb-8">
                        <div className="flex justify-between text-sm text-gray-400">
                            <span>{language === 'ta-IN' ? "விலை / அலகு" : "Unit Price"}</span>
                            <span>₹{order.unit_price} / {order.unit}</span>
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
                        onClick={startPayment}
                        className="w-full py-5 rounded-2xl font-black text-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-[0_0_35px_rgba(16,185,129,0.5)] transform hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
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

                    <div className="w-full bg-slate-900/80 rounded-xl p-4 border border-slate-800 flex items-center justify-between text-xs text-gray-400">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                            <span>{language === 'ta-IN' ? "வங்கி இணைப்பு நிலை: இணைக்கப்பட்டுள்ளது" : "Gateway: Active"}</span>
                        </div>
                        <span className="font-mono text-cyan-400 font-bold">₹{order.total_amount}</span>
                    </div>
                </div>
            )}

            {/* ─── STATE 3: ORDER CONFIRMED & AMOUNT PAID ─── */}
            {paymentState === 'confirmed' && (
                <div className="w-full bg-[#08182B]/95 border border-emerald-500 rounded-3xl p-10 shadow-[0_0_60px_rgba(16,185,129,0.4)] flex flex-col items-center text-center">
                    <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.8)] animate-bounce">
                        <span className="text-5xl">✅</span>
                    </div>

                    <span className="bg-emerald-950 text-emerald-300 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full border border-emerald-600 mb-3">
                        {confirmedData?.order_status || 'order_confirmed'}
                    </span>

                    <h2 className="text-3xl font-black text-white mb-2">
                        {language === 'ta-IN' ? "பணம் வெற்றிகரமாக செலுத்தப்பட்டது!" : "Payment Successful!"}
                    </h2>
                    <p className="text-emerald-300 text-lg font-semibold mb-6">
                        {confirmedData?.status_localized || (language === 'ta-IN' ? "ஆர்டர் உறுதி செய்யப்பட்டு செயலாக்கத்தில் உள்ளது" : "Order Confirmed & Processing")}
                    </p>

                    <div className="w-full bg-slate-900/80 rounded-2xl p-6 border border-slate-800 text-left mb-8 space-y-3">
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-gray-400 text-sm">{language === 'ta-IN' ? "ஆர்டர் எண்" : "Order ID"}</span>
                            <span className="font-mono font-bold text-white">#{order.order_id}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-gray-400 text-sm">{language === 'ta-IN' ? "பொருள்" : "Item"}</span>
                            <span className="font-bold text-white">{order.item_title} ({order.quantity} {order.unit})</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-gray-400 text-sm">{language === 'ta-IN' ? "செலுத்தப்பட்ட தொகை" : "Amount Paid"}</span>
                            <span className="font-bold text-amber-400 text-xl">₹{order.total_amount}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400 text-sm">{language === 'ta-IN' ? "விற்பனையாளர்" : "Seller"}</span>
                            <span className="text-gray-300">{order.seller_name} ({order.seller_phone})</span>
                        </div>
                    </div>

                    <button
                        onClick={onComplete}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-xl transition-all"
                    >
                        {language === 'ta-IN' ? "முகப்பிற்குச் செல்" : "Back to Home"}
                    </button>
                </div>
            )}
        </div>
    );
};

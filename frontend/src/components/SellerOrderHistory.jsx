import React, { useState, useEffect } from 'react';
import { getSellerOrderHistory } from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { getTranslation, translateField } from '../utils/translations';
import { normalizeText, isHomeIntent } from '../utils/voiceMatcher';

export const SellerOrderHistory = ({ language, user, onBack }) => {
    const activeLang = language || sessionStorage.getItem('appLanguage') || user?.language || 'ta-IN';
    const isTamil = activeLang.startsWith('ta');
    const t = getTranslation(activeLang);

    const { 
        setPageContext, 
        setScreenInstruction, 
        setGuidePrompt, 
        speak, 
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();

    const [orders, setOrders] = useState([]);
    const [totalEarnings, setTotalEarnings] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const fetchHistory = async () => {
        setIsLoading(true);
        try {
            const res = await getSellerOrderHistory(user.user_id, activeLang);
            setOrders(res.orders || []);
            setTotalEarnings(res.total_earnings || 0);
        } catch (err) {
            console.error("Failed to fetch seller order history:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [user.user_id, activeLang]);

    useEffect(() => {
        const pageCtx = isTamil ? "விற்பனை வரலாறு & வருவாய்" : "Order History & Earnings";
        setPageContext(pageCtx);

        const screenInstruction = isTamil
            ? "உங்கள் அனைத்து விற்பனை ஆர்டர்கள் மற்றும் மொத்த வருவாய் இங்கே காட்டப்பட்டுள்ளது."
            : "Review your full sales history and verified earnings. Say 'Home' to return.";
        setScreenInstruction(screenInstruction);

        const guide = isTamil
            ? "முகப்பிற்குத் திரும்ப 'முகப்பு' என்று சொல்லுங்கள்."
            : "Say 'Home' to return to dashboard.";
        setGuidePrompt(guide);

        const handleVoiceInput = (spokenText) => {
            if (!spokenText) return;
            const norm = normalizeText(spokenText);

            if (isHomeIntent(norm)) {
                if (onBack) onBack();
            }
        };

        registerVoiceHandler(handleVoiceInput);

        return () => {
            unregisterVoiceHandler();
            setPageContext('');
        };
    }, [activeLang, isTamil, onBack, setPageContext, setScreenInstruction, setGuidePrompt, registerVoiceHandler, unregisterVoiceHandler]);

    const getStatusBadge = (status, localized) => {
        switch (status) {
            case 'order_received':
                return (
                    <span className="px-3.5 py-1.5 bg-emerald-950/80 border border-emerald-500 text-emerald-300 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
                        <span>✅</span>
                        <span>{localized || (isTamil ? "ஆர்டர் பெறப்பட்டது (முடிந்தது)" : "Order Received")}</span>
                    </span>
                );
            case 'package_moving':
                return (
                    <span className="px-3.5 py-1.5 bg-purple-950/80 border border-purple-500 text-purple-300 rounded-full text-xs font-black flex items-center gap-1.5 animate-pulse shadow-sm">
                        <span>🚀</span>
                        <span>{localized || (isTamil ? "பார்சல் பயணத்தில் உள்ளது" : "Package Moving")}</span>
                    </span>
                );
            case 'pickup_scheduled':
                return (
                    <span className="px-3.5 py-1.5 bg-blue-950/80 border border-blue-500 text-blue-300 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
                        <span>🚚</span>
                        <span>{localized || (isTamil ? "பிக்-அப் திட்டமிடப்பட்டது" : "Pickup Scheduled")}</span>
                    </span>
                );
            case 'order_packed':
                return (
                    <span className="px-3.5 py-1.5 bg-amber-950/80 border border-amber-500 text-amber-300 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
                        <span>📦</span>
                        <span>{localized || (isTamil ? "பேக் செய்யப்பட்டது" : "Order Packed")}</span>
                    </span>
                );
            case 'payment_completed':
            case 'order_confirmed':
                return (
                    <span className="px-3.5 py-1.5 bg-teal-950/80 border border-teal-500 text-teal-300 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
                        <span>💰</span>
                        <span>{localized || (isTamil ? "தொகை பெறப்பட்டது" : "Payment Received")}</span>
                    </span>
                );
            default:
                return (
                    <span className="px-3.5 py-1.5 bg-slate-800 border border-slate-700 text-gray-300 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
                        <span>📝</span>
                        <span>{localized || (isTamil ? "புதிய ஆர்டர்" : "New Order")}</span>
                    </span>
                );
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center p-4 md:p-6 pb-36 text-white">
            {/* Header Navigation */}
            <div className="w-full flex justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black text-white flex items-center gap-3">
                        <span>💰</span>
                        <span>{isTamil ? "விற்பனை வரலாறு & வருவாய்" : "Sales History & Earnings"}</span>
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {isTamil 
                            ? "நிறைவேற்றப்பட்ட ஆர்டர்கள் மற்றும் உங்களின் மொத்த வருவாய் விவரங்கள்" 
                            : "Verified earnings log and completed order dispatches"}
                    </p>
                </div>
                {onBack && (
                    <button
                        onClick={onBack}
                        className="px-5 py-2.5 bg-slate-800/90 hover:bg-slate-700 text-gray-200 font-bold rounded-xl text-sm transition-all border border-slate-700 shadow-md flex items-center gap-2 flex-shrink-0"
                    >
                        <span>←</span>
                        <span>{isTamil ? "முகப்பு" : "Dashboard"}</span>
                    </button>
                )}
            </div>

            {/* Total Earnings Summary Card */}
            <div className="w-full bg-gradient-to-r from-[#07241A] via-[#0A2E22] to-[#061B14] border-2 border-emerald-500/50 rounded-3xl p-8 mb-8 shadow-[0_0_40px_rgba(16,185,129,0.25)] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                    <span className="text-emerald-400 text-xs font-black uppercase tracking-widest bg-emerald-950 px-3 py-1 rounded-full border border-emerald-700/60">
                        {isTamil ? "சரிபார்க்கப்பட்ட இறுதி வருவாய்" : "Verified Total Earnings"}
                    </span>
                    <p className="text-4xl md:text-5xl font-black text-emerald-300 mt-2">
                        ₹{totalEarnings.toLocaleString()}
                    </p>
                    <p className="text-gray-300 text-xs mt-1">
                        {isTamil 
                            ? "நேரடியாக உங்கள் வங்கிக் கணக்கில் வரவு வைக்கப்படும்" 
                            : "Directly credited to producer account"}
                    </p>
                </div>
                <div className="bg-[#04120D] p-5 rounded-2xl border border-emerald-800/60 text-left md:text-right min-w-[160px]">
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">
                        {isTamil ? "விற்பனை ஆர்டர்கள்" : "Total Sales"}
                    </p>
                    <p className="text-3xl font-black text-white mt-1">
                        {orders.length}
                    </p>
                </div>
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="w-full py-16 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-emerald-300 font-bold text-sm">
                        {isTamil ? "விற்பனை வரலாறு ஏற்றப்படுகிறது..." : "Loading sales history..."}
                    </p>
                </div>
            )}

            {/* Empty State */}
            {!isLoading && orders.length === 0 && (
                <div className="w-full bg-[#0B152B]/80 border border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center shadow-xl">
                    <span className="text-5xl mb-4">📦</span>
                    <h3 className="text-xl font-bold text-white mb-2">
                        {isTamil ? "விற்பனை வரலாறு எதுவும் இல்லை" : "No Sales Records Yet"}
                    </h3>
                    <p className="text-gray-400 text-sm max-w-sm mb-6">
                        {isTamil 
                            ? "வாங்குபவர்களிடமிருந்து புதிய ஆர்டர்கள் வந்ததும் இங்கே காணப்படும்." 
                            : "Completed and active orders will appear here once buyers place orders."}
                    </p>
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-sm shadow-lg transition-all"
                        >
                            {isTamil ? "முகப்பிற்குத் திரும்பு" : "Return to Dashboard"}
                        </button>
                    )}
                </div>
            )}

            {/* Orders List */}
            {!isLoading && orders.length > 0 && (
                <div className="w-full flex flex-col gap-5">
                    {orders.map((order) => {
                        const isDelivered = order.status === 'order_received';
                        return (
                            <div 
                                key={order.order_id}
                                className={`bg-[#0B152B]/90 border rounded-3xl p-6 shadow-2xl flex flex-col gap-4 transition-all ${
                                    isDelivered ? 'border-emerald-600/70' : 'border-slate-800 hover:border-cyan-500/50'
                                }`}
                            >
                                {/* Header: Order ID, Date, Status */}
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono text-cyan-400 font-bold text-sm">
                                            #{order.order_id}
                                        </span>
                                        <span className="text-gray-400 text-xs">
                                            {order.created_at ? new Date(order.created_at).toLocaleDateString() : ''}
                                        </span>
                                    </div>
                                    <div>
                                        {getStatusBadge(order.status, translateField(order.status, activeLang))}
                                    </div>
                                </div>

                                {/* Body: Product, Buyer, Earnings */}
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div>
                                        <h3 className="text-2xl font-black text-amber-400">
                                            {translateField(order.item_title, activeLang)}
                                        </h3>
                                        <p className="text-gray-300 text-sm font-semibold mt-1">
                                            📦 {isTamil ? "விற்கப்பட்ட அளவு" : "Quantity Sold"}: <span className="text-white font-bold">{order.quantity} {translateField(order.unit, activeLang)}</span>
                                            {order.unit_price > 0 && (
                                                 <span className="text-gray-400 text-xs ml-2">
                                                     (₹{order.unit_price} / {translateField(order.unit, activeLang)})
                                                 </span>
                                            )}
                                        </p>
                                        <p className="text-gray-400 text-xs mt-1">
                                            👤 {isTamil ? "வாங்குபவர்" : "Buyer"}: <span className="text-gray-200 font-semibold">{translateField(order.buyer_name, activeLang)}</span> • 📍 {translateField(order.buyer_village, activeLang)} {order.buyer_phone ? `• 📞 ${order.buyer_phone}` : ''}
                                        </p>
                                    </div>

                                    <div className="text-left md:text-right flex-shrink-0">
                                        <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">
                                            {isTamil ? "இறுதி வருவாய்" : "Producer Earnings"}
                                        </p>
                                        <p className="text-2xl font-black text-emerald-400">
                                            ₹{order.total_amount}
                                        </p>
                                    </div>
                                </div>

                                {/* Logistics Details */}
                                {(order.delivery_partner || order.tracking_id || order.delivery_time) && (
                                    <div className="bg-[#050C1A] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-xs">
                                        <div>
                                            <p className="text-cyan-400 font-bold flex items-center gap-1.5">
                                                <span>🚚</span>
                                                <span>{translateField(order.delivery_partner, activeLang) || (isTamil ? "TRIFED கிராமப்புற விநியோகம்" : "TRIFED Rural Logistics Dispatch")}</span>
                                            </p>
                                            {order.tracking_id && (
                                                <p className="text-gray-400 font-mono mt-0.5">
                                                    ID: {order.tracking_id}
                                                </p>
                                            )}
                                        </div>
                                        {order.delivery_time && (
                                            <div className="text-emerald-400 font-bold">
                                                ✓ {translateField(order.delivery_time, activeLang)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

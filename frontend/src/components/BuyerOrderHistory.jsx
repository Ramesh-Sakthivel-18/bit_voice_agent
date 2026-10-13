import React, { useState, useEffect } from 'react';
import { getBuyerOrderHistory, confirmOrderReceived } from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { getTranslation, translateField } from '../utils/translations';
import { normalizeText, isHomeIntent, isOrderReceivedIntent } from '../utils/voiceMatcher';

export const BuyerOrderHistory = ({ language, user, onBack }) => {
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
    const [totalSpent, setTotalSpent] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [actionOrderId, setActionOrderId] = useState(null);

    const fetchHistory = async () => {
        setIsLoading(true);
        try {
            const res = await getBuyerOrderHistory(user.user_id, activeLang);
            setOrders(res.orders || []);
            setTotalSpent(res.total_spent || 0);
        } catch (err) {
            console.error("Failed to load buyer order history:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [user.user_id, activeLang]);

    useEffect(() => {
        const pageCtx = isTamil ? "ஆர்டர் வரலாறு / Order History" : "Order History";
        setPageContext(pageCtx);

        const screenInstruction = isTamil
            ? "உங்கள் ஆர்டர்களின் நிலை மற்றும் வரலாற்றை இங்கே காணலாம். முகப்பிற்கு திரும்ப 'முகப்பு' என்று சொல்லுங்கள்."
            : "Review your active and completed orders. Say 'Home' to return to dashboard.";
        setScreenInstruction(screenInstruction);

        const guide = isTamil
            ? "பொருள் வந்து சேர்ந்ததும் 'பெற்றேன்' என்று சொல்லுங்கள் அல்லது முகப்பிற்குச் செல்ல 'முகப்பு' என்று சொல்லுங்கள்."
            : "Say 'Order Received' once your package arrives, or 'Home' to return.";
        setGuidePrompt(guide);

        const handleVoiceInput = async (spokenText) => {
            if (!spokenText) return;
            const norm = normalizeText(spokenText);

            if (isHomeIntent(norm)) {
                if (onBack) onBack();
                return;
            }

            if (isOrderReceivedIntent(norm)) {
                // Find first moving or dispatched order
                const movingOrder = orders.find(o => o.status === 'package_moving' || o.status === 'pickup_scheduled');
                if (movingOrder) {
                    handleConfirmReceived(movingOrder.order_id);
                } else {
                    const noMovingMsg = isTamil 
                        ? "பயணத்தில் உள்ள ஆர்டர்கள் எதுவும் இல்லை." 
                        : "No packages currently in transit.";
                    speak(noMovingMsg, activeLang);
                }
            }
        };

        registerVoiceHandler(handleVoiceInput);

        return () => {
            unregisterVoiceHandler();
            setPageContext('');
        };
    }, [orders, activeLang, isTamil, onBack, setPageContext, setScreenInstruction, setGuidePrompt, registerVoiceHandler, unregisterVoiceHandler, speak]);

    const handleConfirmReceived = async (orderId) => {
        setActionOrderId(orderId);
        try {
            const res = await confirmOrderReceived(orderId, user.user_id, activeLang);
            
            setOrders(prev => prev.map(o => {
                if (o.order_id === orderId) {
                    return {
                        ...o,
                        status: res.order_status,
                        status_localized: res.status_localized,
                        delivery_time: res.delivery_time,
                        is_delivered: true
                    };
                }
                return o;
            }));

            if (res.voice_prompt) {
                speak(res.voice_prompt, activeLang);
            }
        } catch (err) {
            console.error("Confirm received error:", err);
            alert(isTamil ? "பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்." : "Failed to confirm receipt.");
        } finally {
            setActionOrderId(null);
        }
    };

    const getStatusBadge = (status, localized) => {
        switch (status) {
            case 'order_received':
                return (
                    <span className="px-3 py-1 bg-emerald-950/80 border border-emerald-500 text-emerald-300 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
                        <span>✅</span>
                        <span>{localized || (isTamil ? "ஆர்டர் பெறப்பட்டது" : "Order Received")}</span>
                    </span>
                );
            case 'package_moving':
                return (
                    <span className="px-3 py-1 bg-purple-950/80 border border-purple-500 text-purple-300 rounded-full text-xs font-black flex items-center gap-1.5 animate-pulse shadow-sm">
                        <span>🚀</span>
                        <span>{localized || (isTamil ? "பார்சல் பயணத்தில் உள்ளது" : "Package Moving")}</span>
                    </span>
                );
            case 'pickup_scheduled':
                return (
                    <span className="px-3 py-1 bg-blue-950/80 border border-blue-500 text-blue-300 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
                        <span>🚚</span>
                        <span>{localized || (isTamil ? "பிக்-அப் திட்டமிடப்பட்டது" : "Pickup Scheduled")}</span>
                    </span>
                );
            case 'order_packed':
                return (
                    <span className="px-3 py-1 bg-amber-950/80 border border-amber-500 text-amber-300 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
                        <span>📦</span>
                        <span>{localized || (isTamil ? "ஆர்டர் பேக் செய்யப்பட்டது" : "Order Packed")}</span>
                    </span>
                );
            case 'payment_completed':
            case 'order_confirmed':
                return (
                    <span className="px-3 py-1 bg-teal-950/80 border border-teal-500 text-teal-300 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
                        <span>💳</span>
                        <span>{localized || (isTamil ? "கட்டணம் செலுத்தப்பட்டது" : "Payment Done / Processing")}</span>
                    </span>
                );
            default:
                return (
                    <span className="px-3 py-1 bg-slate-800 border border-slate-700 text-gray-300 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
                        <span>📝</span>
                        <span>{localized || (isTamil ? "ஆர்டர் செய்யப்பட்டது" : "Order Placed")}</span>
                    </span>
                );
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center p-4 md:p-6 pb-36 text-white">
            {/* Header */}
            <div className="w-full flex justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black text-white flex items-center gap-3">
                        <span>📜</span>
                        <span>{isTamil ? "என் ஆர்டர் வரலாறு" : "My Order History"}</span>
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {isTamil 
                            ? "உங்கள் நேரடி கொள்முதல்கள் மற்றும் டெலிவரி கண்காணிப்பு" 
                            : "Track real-time package dispatch and completed purchases"}
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

            {/* Total Purchases Summary Card */}
            <div className="w-full bg-gradient-to-r from-[#0C1E3C] to-[#08152B] border border-cyan-500/30 rounded-3xl p-6 mb-8 shadow-xl flex items-center justify-between">
                <div>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">
                        {isTamil ? "மொத்த கொள்முதல் செலவு" : "Total Purchases Log"}
                    </p>
                    <p className="text-3xl md:text-4xl font-black text-amber-400 mt-1">
                        ₹{totalSpent.toLocaleString()}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">
                        {isTamil ? "மொத்த ஆர்டர்கள்" : "Total Orders"}
                    </p>
                    <p className="text-3xl font-black text-white mt-1">
                        {orders.length}
                    </p>
                </div>
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="w-full py-16 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-cyan-300 font-bold text-sm">
                        {isTamil ? "ஆர்டர் வரலாறு ஏற்றப்படுகிறது..." : "Loading order history..."}
                    </p>
                </div>
            )}

            {/* Empty State */}
            {!isLoading && orders.length === 0 && (
                <div className="w-full bg-[#0B152B]/80 border border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center shadow-xl">
                    <span className="text-5xl mb-4">🛒</span>
                    <h3 className="text-xl font-bold text-white mb-2">
                        {isTamil ? "ஆர்டர்கள் எதுவும் இல்லை" : "No Past Orders"}
                    </h3>
                    <p className="text-gray-400 text-sm max-w-sm mb-6">
                        {isTamil 
                            ? "நீங்கள் இன்னும் எந்தப் பொருளையும் ஆர்டர் செய்யவில்லை. புதிய இயற்கை தயாரிப்புகளைத் தேடுங்கள்." 
                            : "You have not placed any orders yet. Discover fresh tribal produce now."}
                    </p>
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl text-sm shadow-lg transition-all"
                        >
                            {isTamil ? "பொருட்களை வாங்கச் செல்" : "Browse Products"}
                        </button>
                    )}
                </div>
            )}

            {/* Orders List */}
            {!isLoading && orders.length > 0 && (
                <div className="w-full flex flex-col gap-5">
                    {orders.map((order) => {
                        const canMarkReceived = order.status === 'package_moving' || order.status === 'pickup_scheduled';
                        return (
                            <div 
                                key={order.order_id}
                                className="bg-[#0B152B]/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 hover:border-cyan-500/50 transition-all"
                            >
                                {/* Top Row: Order ID, Date, Status */}
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

                                {/* Main Content: Produce, Quantity, Total Amount */}
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div>
                                        <h3 className="text-2xl font-black text-amber-400">
                                            {translateField(order.item_title, activeLang)}
                                        </h3>
                                        <p className="text-gray-300 text-sm font-semibold mt-1">
                                            📦 {isTamil ? "அளவு" : "Quantity"}: <span className="text-white font-bold">{order.quantity} {translateField(order.unit, activeLang)}</span>
                                            {order.unit_price > 0 && (
                                                <span className="text-gray-400 text-xs ml-2">
                                                    (₹{order.unit_price} / {translateField(order.unit, activeLang)})
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-gray-400 text-xs mt-1">
                                            👨‍🌾 {translateField(order.seller_name, activeLang)} • 📍 {translateField(order.seller_village, activeLang)}
                                        </p>
                                    </div>

                                    <div className="text-left md:text-right flex-shrink-0">
                                        <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">
                                            {isTamil ? "செலுத்தப்பட்ட தொகை" : "Paid Amount"}
                                        </p>
                                        <p className="text-2xl font-black text-emerald-400">
                                            ₹{order.total_amount}
                                        </p>
                                    </div>
                                </div>

                                {/* Logistics / Tracking Bar */}
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

                                {/* Action: Mark Order Received Button */}
                                {canMarkReceived && (
                                    <div className="pt-2 flex justify-end">
                                        <button
                                            onClick={() => handleConfirmReceived(order.order_id)}
                                            disabled={actionOrderId === order.order_id}
                                            className="w-full md:w-auto px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black rounded-xl text-sm shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                                        >
                                            <span>✅</span>
                                            <span>
                                                {actionOrderId === order.order_id 
                                                    ? "..." 
                                                    : (isTamil ? "பொருளைப் பெற்றேன் (உறுதி செய்)" : "Confirm Order Received")}
                                            </span>
                                        </button>
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

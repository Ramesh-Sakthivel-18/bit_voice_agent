import React, { useEffect, useState, useRef } from 'react';
import { 
    getSellerPendingOrders, 
    getSellerConfirmedOrders,
    packOrder,
    scheduleOrderPickup,
    dispatchOrder
} from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { SellerCommerceView } from './SellerCommerceView';
import { SellerListings } from './SellerListings';
import { SellerOrderHistory } from './SellerOrderHistory';
import { MarketAssistantWidget } from './MarketAssistantWidget';
import { getTranslation, translateField } from '../utils/translations';
import { 
    isNewSaleIntent, 
    isMyProductsIntent, 
    isPackOrderIntent,
    isPickupIntent,
    isDispatchIntent,
    isOrderHistoryIntent,
    isHomeIntent, 
    isLogoutIntent,
    isAffirmativeIntent,
    isNegativeIntent,
    normalizeText
} from '../utils/voiceMatcher';

export const SellerDashboard = ({ language, user }) => {
    const { 
        setPageContext,
        setScreenInstruction, 
        setGuidePrompt, 
        speak, 
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();
    const t = getTranslation(language);

    // View modes: 'dashboard' | 'commerce' | 'listings' | 'history'
    const [viewMode, setViewMode] = useState('dashboard');
    const [pendingOrders, setPendingOrders] = useState([]);
    const [confirmedOrders, setConfirmedOrders] = useState([]);
    const [activePromptOrderId, setActivePromptOrderId] = useState(null);
    const [dismissedOrderIds, setDismissedOrderIds] = useState(new Set());
    const [recentCompletedOrder, setRecentCompletedOrder] = useState(null);

    // Step 4 Voice Confirmation Guardrail state: { type: 'pack_order' | 'schedule_pickup' | 'dispatch_order', order, prompt }
    const [guardrailAction, setGuardrailAction] = useState(null);
    const [isActionProcessing, setIsActionProcessing] = useState(false);

    const spokenPendingRef = useRef(new Set());
    const spokenConfirmedRef = useRef(new Set());
    const pickupPromptedRef = useRef(new Set());
    const prevConfirmedOrdersRef = useRef([]);

    // Filter active orders for Side Panel (Excludes completed 'order_received', cancelled, or dismissed)
    const activeFulfillmentOrders = confirmedOrders.filter(o => 
        o.status !== 'order_received' &&
        o.status !== 'cancelled' &&
        !dismissedOrderIds.has(o.order_id) &&
        (o.status === 'order_packed' || o.status === 'pickup_scheduled' || o.status === 'package_moving')
    );

    const unDismissedPendingOrders = pendingOrders.filter(o => !dismissedOrderIds.has(o.order_id));

    const totalActiveOrdersCount = unDismissedPendingOrders.length + activeFulfillmentOrders.length + (recentCompletedOrder ? 1 : 0);
    const hasActiveOrders = totalActiveOrdersCount > 0;

    // Screen instructions and 1-Click Guide Prompts
    useEffect(() => {
        if (viewMode !== 'dashboard') return;

        let pageCtx = language === 'ta-IN' ? "விற்பனையாளர் முகப்பு / Seller Home" : "Seller Home";
        if (guardrailAction) {
            pageCtx = language === 'ta-IN' ? "உறுதிப்படுத்தல் / Guardrail Confirmation" : "Confirm Action";
        }
        setPageContext(pageCtx);

        const instruction = guardrailAction
            ? (language === 'ta-IN'
                ? "உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்."
                : "Say 'Yes' to confirm or 'No' to cancel.")
            : (t.screenSellerDashboard || (
                language === 'ta-IN'
                    ? "விற்பனையாளர் முகப்பு. புதிய வாங்குபவர் ஆர்டர்களை பேக் செய்ய அல்லது பிக்-அப் திட்டமிட மைக்ரோஃபோனை தட்டுங்கள்."
                    : "Seller Home. Tap mic to pack buyer orders, schedule pickup, or view sales history."
            ));
        setScreenInstruction(instruction, !!guardrailAction);

        const guide = guardrailAction
            ? (language === 'ta-IN' ? "உறுதிப்படுத்த 'ஆம்', ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்." : "Say 'Yes' to confirm, 'No' to cancel.")
            : (language === 'ta-IN'
                ? "ஆர்டரை பேக் செய்ய 'பேக்' என்று சொல்லுங்கள். பிக்-அப்பிற்கு 'பிக்-அப்' என்று சொல்லுங்கள். வரலாற்றிற்கு 'வரலாறு' என்று சொல்லுங்கள்."
                : "Say 'Pack' to prepare orders, 'Pickup' to schedule transport, or 'History' for earnings.");
        setGuidePrompt(guide);

        return () => {
            setPageContext('');
        };
    }, [viewMode, language, guardrailAction, setPageContext, setScreenInstruction, setGuidePrompt, t]);

    // Poll for New Buyer Orders & Active Fulfillment Orders
    useEffect(() => {
        if (viewMode !== 'dashboard') return;

        const syncSellerData = async () => {
            try {
                // 1. Fetch New Buyer Orders (order_placed, payment_completed)
                const pendingRes = await getSellerPendingOrders(user.user_id, language);
                const pOrders = pendingRes.orders || [];
                setPendingOrders(pOrders);

                if (pOrders.length > 0) {
                    const latest = pOrders[0];
                    if (!spokenPendingRef.current.has(latest.order_id)) {
                        spokenPendingRef.current.add(latest.order_id);
                        setActivePromptOrderId(latest.order_id);

                        const notification = pendingRes.voice_notification || (
                            language === 'ta-IN'
                                ? `புதிய வாங்குபவர் ஆர்டர் வந்துள்ளது! ${translateField(latest.item_title, language)} ${latest.quantity} ${translateField(latest.unit, language)}. பேக் செய்ய 'பேக்' என்று சொல்லுங்கள்.`
                                : `New buyer order received for ${latest.quantity} ${latest.unit} of ${latest.item_title}. Say 'Pack' to prepare order.`
                        );
                        speak(notification, language);
                    }
                }

                // 2. Fetch Active Fulfillment Orders (order_packed, pickup_scheduled, package_moving, order_received)
                const confRes = await getSellerConfirmedOrders(user.user_id, language);
                const cOrders = confRes.confirmed_orders || [];
                setConfirmedOrders(cOrders);

                // Detect if an order just became received (buyer accepted)
                cOrders.forEach(o => {
                    if (o.status === 'order_received') {
                        const prev = prevConfirmedOrdersRef.current.find(p => p.order_id === o.order_id);
                        if (prev && prev.status !== 'order_received') {
                            setRecentCompletedOrder(o);
                            setTimeout(() => {
                                setRecentCompletedOrder(curr => (curr?.order_id === o.order_id ? null : curr));
                            }, 8000);
                        }
                    }
                });
                prevConfirmedOrdersRef.current = cOrders;

                if (cOrders.length > 0) {
                    const packedNeedPickup = cOrders.find(o => o.status === 'order_packed');
                    if (packedNeedPickup && !pickupPromptedRef.current.has(packedNeedPickup.order_id)) {
                        pickupPromptedRef.current.add(packedNeedPickup.order_id);

                        setTimeout(() => {
                            const prompt = language === 'ta-IN'
                                ? `${translateField(packedNeedPickup.item_title, language)} பேக் செய்யப்பட்டுள்ளது! டெலிவரி பிக்-அப்பை திட்டமிட 'பிக்-அப்' அல்லது 'ஆம்' என்று சொல்லுங்கள்.`
                                : `${packedNeedPickup.item_title} is packed! Say 'Schedule Pickup' to dispatch logistics van.`;
                            speak(prompt, language);
                        }, 2000);
                    }
                }
            } catch (err) {
                console.error("Seller dashboard sync error:", err);
            }
        };

        syncSellerData();
        const interval = setInterval(syncSellerData, 3000);
        return () => clearInterval(interval);
    }, [user.user_id, language, viewMode, speak]);

    // ─── ACTION 1: INITIATE PACK ORDER (GUARDRAIL STEP 4) ───
    const initiatePackOrder = (order) => {
        if (!order) return;
        const prompt = language === 'ta-IN'
            ? `நான் ${translateField(order.item_title, language)} (${order.quantity} ${translateField(order.unit, language)}) ஆர்டரை பேக் செய்ததாக பதிவு செய்ய உள்ளேன். உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்.`
            : `I am about to mark order #${order.order_id} (${order.item_title}, ${order.quantity} ${order.unit}) as packed. Say 'Yes' to confirm or 'No' to cancel.`;

        setGuardrailAction({
            type: 'pack_order',
            order,
            prompt
        });
        speak(prompt, language);
    };

    // ─── COMMIT PACK ORDER TO SQLITE ───
    const commitPackOrder = async (orderId) => {
        setIsActionProcessing(true);
        try {
            const res = await packOrder(orderId, user.user_id, language);
            
            // Move from pending to confirmed
            setPendingOrders(prev => prev.filter(o => o.order_id !== orderId));
            setGuardrailAction(null);

            if (res.voice_prompt) {
                speak(res.voice_prompt, language);
            }

            // Immediately refresh confirmed orders
            const confRes = await getSellerConfirmedOrders(user.user_id, language);
            setConfirmedOrders(confRes.confirmed_orders || []);
        } catch (err) {
            console.error("Pack order error:", err);
            alert(language === 'ta-IN' ? "பேக்கிங் பதிவில் பிழை ஏற்பட்டது." : "Could not pack order. Please try again.");
        } finally {
            setIsActionProcessing(false);
        }
    };

    // ─── ACTION 2: INITIATE SCHEDULE PICKUP (GUARDRAIL STEP 4) ───
    const initiateSchedulePickup = (order) => {
        if (!order) return;
        const prompt = language === 'ta-IN'
            ? `${translateField(order.item_title, language)}க்கான கிராமப்புற டெலிவரி பிக்-அப்பை திட்டமிட உள்ளேன். உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்.`
            : `I am about to schedule delivery pickup for ${order.item_title}. Say 'Yes' to confirm or 'No' to cancel.`;

        setGuardrailAction({
            type: 'schedule_pickup',
            order,
            prompt
        });
        speak(prompt, language);
    };

    // ─── COMMIT SCHEDULE PICKUP TO SQLITE ───
    const commitSchedulePickup = async (orderId) => {
        setIsActionProcessing(true);
        try {
            const res = await scheduleOrderPickup(orderId, user.user_id, language);
            setConfirmedOrders(prev => prev.map(o => {
                if (o.order_id === orderId) {
                    return {
                        ...o,
                        status: res.order_status,
                        status_localized: res.status_localized,
                        delivery_partner: res.delivery_partner,
                        tracking_id: res.tracking_id,
                        pickup_time: res.pickup_time,
                        pickup_address: res.pickup_address,
                        is_pickup_scheduled: true
                    };
                }
                return o;
            }));

            setGuardrailAction(null);

            if (res.voice_prompt) {
                speak(res.voice_prompt, language);
            }
        } catch (err) {
            console.error("Schedule pickup error:", err);
            alert(language === 'ta-IN' ? "பிக்-அப் திட்டமிடுவதில் பிழை ஏற்பட்டது." : "Could not schedule pickup.");
        } finally {
            setIsActionProcessing(false);
        }
    };

    // ─── ACTION 3: COMMIT DISPATCH / PACKAGE MOVING TO SQLITE ───
    const commitDispatchOrder = async (orderId) => {
        setIsActionProcessing(true);
        try {
            const res = await dispatchOrder(orderId, language);
            setConfirmedOrders(prev => prev.map(o => {
                if (o.order_id === orderId) {
                    return {
                        ...o,
                        status: res.order_status,
                        status_localized: res.status_localized,
                        is_package_moving: true
                    };
                }
                return o;
            }));

            setGuardrailAction(null);

            if (res.voice_prompt) {
                speak(res.voice_prompt, language);
            }
        } catch (err) {
            console.error("Dispatch order error:", err);
            alert(language === 'ta-IN' ? "பயண பதிவில் பிழை ஏற்பட்டது." : "Could not mark package as dispatched.");
        } finally {
            setIsActionProcessing(false);
        }
    };

    const cancelGuardrail = () => {
        setGuardrailAction(null);
        const cancelMsg = language === 'ta-IN' ? "செயல் ரத்து செய்யப்பட்டது." : "Action cancelled.";
        speak(cancelMsg, language);
    };

    // ─── VOICE COMMAND HANDLER ───
    useEffect(() => {
        if (viewMode !== 'dashboard') return;

        const handleVoiceInput = async (spokenText) => {
            if (!spokenText) return;
            const norm = normalizeText(spokenText);
            console.log("[Seller Voice Input Command]:", norm);

            // A. Guardrail confirmation check
            if (guardrailAction) {
                if (isAffirmativeIntent(norm)) {
                    if (guardrailAction.type === 'pack_order') {
                        commitPackOrder(guardrailAction.order.order_id);
                    } else if (guardrailAction.type === 'schedule_pickup') {
                        commitSchedulePickup(guardrailAction.order.order_id);
                    } else if (guardrailAction.type === 'dispatch_order') {
                        commitDispatchOrder(guardrailAction.order.order_id);
                    }
                    return;
                }

                if (isNegativeIntent(norm)) {
                    cancelGuardrail();
                    return;
                }

                speak(language === 'ta-IN' ? "உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்." : "Say 'Yes' to confirm or 'No' to cancel.", language);
                return;
            }

            // B. Pack Order Intent
            if (isPackOrderIntent(norm)) {
                if (unDismissedPendingOrders.length > 0) {
                    initiatePackOrder(unDismissedPendingOrders[0]);
                    return;
                }
            }

            // C. Schedule Pickup Intent
            if (isPickupIntent(norm)) {
                const packedOrder = activeFulfillmentOrders.find(o => o.status === 'order_packed');
                if (packedOrder) {
                    initiateSchedulePickup(packedOrder);
                    return;
                }
            }

            // D. Dispatch / Handover Intent
            if (isDispatchIntent(norm)) {
                const scheduledOrder = activeFulfillmentOrders.find(o => o.status === 'pickup_scheduled');
                if (scheduledOrder) {
                    commitDispatchOrder(scheduledOrder.order_id);
                    return;
                }
            }

            // E. Order History Intent
            if (isOrderHistoryIntent(norm)) {
                const navMsg = language === 'ta-IN' ? "விற்பனை வரலாறு பக்கத்திற்குச் செல்கிறது..." : "Navigating to Sales History...";
                speak(navMsg, language);
                setViewMode('history');
                return;
            }

            // F. My Products Intent
            if (isMyProductsIntent(norm)) {
                const navMsg = t.navigatingToListings || (
                    language === 'ta-IN' ? "உங்கள் விற்பனைப் பொருட்கள் பக்கத்திற்குச் செல்கிறது..." : "Navigating to Product Listings..."
                );
                speak(navMsg, language);
                setViewMode('listings');
                return;
            }

            // G. New Sale Intent
            if (isNewSaleIntent(norm)) {
                const navMsg = language === 'ta-IN' ? "புதிய விற்பனை பக்கத்திற்குச் செல்கிறது..." : "Navigating to New Listing...";
                speak(navMsg, language);
                setViewMode('commerce');
                return;
            }

            // H. Logout Intent
            if (isLogoutIntent(norm)) {
                sessionStorage.clear();
                window.location.href = '/';
                return;
            }
        };

        registerVoiceHandler(handleVoiceInput);
        return () => unregisterVoiceHandler(handleVoiceInput);
    }, [viewMode, language, guardrailAction, unDismissedPendingOrders, activeFulfillmentOrders, registerVoiceHandler, unregisterVoiceHandler, speak, t]);

    if (viewMode === 'commerce') {
        return <SellerCommerceView language={language} user={user} onBack={() => setViewMode('dashboard')} />;
    }

    if (viewMode === 'listings') {
        return <SellerListings language={language} user={user} onBack={() => setViewMode('dashboard')} />;
    }

    if (viewMode === 'history') {
        return <SellerOrderHistory language={language} user={user} onBack={() => setViewMode('dashboard')} />;
    }

    return (
        <div className={`w-full ${hasActiveOrders ? 'max-w-7xl' : 'max-w-5xl'} mx-auto flex flex-col items-center p-4 sm:p-6 text-white pb-36 relative transition-all duration-300`}>
            {/* Header Bar */}
            <div className="w-full flex flex-col md:flex-row justify-between items-center mb-6 sm:mb-8 gap-4 border-b border-slate-800/80 pb-5">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black text-white text-center md:text-left">
                        {language === 'ta-IN' ? "வணக்கம்" : "Welcome"}, <span className="text-amber-400">{translateField(user.name, language)}!</span>
                    </h1>
                    <p className="text-gray-400 text-xs sm:text-sm mt-1 text-center md:text-left">
                        📍 {translateField(user.village || 'Tamil Nadu', language)} • 🌾 {language === 'ta-IN' ? "விற்பனையாளர் டாஷ்போர்டு" : "Producer Dashboard"}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setViewMode('history')}
                        className="px-4 py-2 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 font-bold rounded-xl text-xs shadow-lg transition-colors border border-emerald-500/50 flex items-center gap-1.5 cursor-pointer"
                    >
                        <span>💰</span>
                        <span>{language === 'ta-IN' ? "வருவாய் & வரலாறு" : "Earnings & History"}</span>
                    </button>
                    <button 
                        onClick={() => {
                            sessionStorage.clear();
                            window.location.href = '/';
                        }}
                        className="px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white font-bold rounded-xl text-xs shadow-lg transition-colors cursor-pointer"
                    >
                        {language === 'ta-IN' ? "வெளியேறு" : "Logout"}
                    </button>
                </div>
            </div>

            {/* ─── MAIN DASHBOARD WORKSPACE ─── */}
            <div className={`w-full ${hasActiveOrders ? 'grid grid-cols-1 lg:grid-cols-12 gap-7 items-start' : 'flex flex-col items-center'}`}>
                
                {/* ─── 1. LEFT COLUMN: CORE NAVIGATION TILES (UNDISTURBED!) ─── */}
                <div className={`${hasActiveOrders ? 'lg:col-span-7 xl:col-span-8' : 'w-full max-w-5xl'} flex flex-col gap-6`}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-200 flex items-center gap-2">
                            <span>⚡</span>
                            <span>{language === 'ta-IN' ? "முதன்மை செயல்பாடுகள்" : "Core Dashboard Actions"}</span>
                        </h2>
                        {hasActiveOrders && (
                            <span className="text-xs text-cyan-300/90 font-bold bg-cyan-950/60 px-3 py-1 rounded-full border border-cyan-500/30 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                                <span>{language === 'ta-IN' ? "பக்க பேனலில் ஆர்டர்கள் உள்ளன" : "Orders in side panel"}</span>
                            </span>
                        )}
                    </div>

                    {/* 3 Core Action Tiles */}
                    <div className={`grid grid-cols-1 ${hasActiveOrders ? 'sm:grid-cols-3' : 'md:grid-cols-3'} gap-5 w-full`}>
                        {/* Tile 1: New Sale */}
                        <div 
                            onClick={() => setViewMode('commerce')}
                            className="flex flex-col items-center justify-center p-6 sm:p-8 bg-gradient-to-b from-[#09152B]/95 to-[#061124]/95 rounded-3xl border border-slate-700/80 hover:border-cyan-400/80 shadow-2xl cursor-pointer hover:scale-[1.03] active:scale-95 transition-all text-center group"
                        >
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-[0_0_30px_rgba(6,182,212,0.5)] flex items-center justify-center mb-4 group-hover:shadow-[0_0_40px_rgba(6,182,212,0.8)] transition-all">
                                <span className="text-3xl sm:text-4xl">🏷️</span>
                            </div>
                            <h3 className="text-lg font-black text-white mb-1 group-hover:text-cyan-300 transition-colors">
                                {language === 'ta-IN' ? "புதிய விற்பனை" : "New Listing"}
                            </h3>
                            <p className="text-xs text-gray-400 font-medium">
                                {language === 'ta-IN' ? "குரல் அல்லது தட்டச்சு வழியே பதிவு" : "Dual-mode voice & typing wizard"}
                            </p>
                        </div>

                        {/* Tile 2: My Listings */}
                        <div 
                            onClick={() => setViewMode('listings')}
                            className="flex flex-col items-center justify-center p-6 sm:p-8 bg-gradient-to-b from-[#09152B]/95 to-[#061124]/95 rounded-3xl border border-slate-700/80 hover:border-emerald-400/80 shadow-2xl cursor-pointer hover:scale-[1.03] active:scale-95 transition-all text-center group"
                        >
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 shadow-[0_0_30px_rgba(16,185,129,0.5)] flex items-center justify-center mb-4 group-hover:shadow-[0_0_40px_rgba(16,185,129,0.8)] transition-all">
                                <span className="text-3xl sm:text-4xl">📋</span>
                            </div>
                            <h3 className="text-lg font-black text-white mb-1 group-hover:text-emerald-300 transition-colors">
                                {language === 'ta-IN' ? "என் விற்பனைப் பொருட்கள்" : "My Active Listings"}
                            </h3>
                            <p className="text-xs text-gray-400 font-medium">
                                {language === 'ta-IN' ? "இருப்பு மற்றும் விலையை நிர்வகிக்க" : "Manage active items & stock"}
                            </p>
                        </div>

                        {/* Tile 3: Sales History & Earnings */}
                        <div 
                            onClick={() => setViewMode('history')}
                            className="flex flex-col items-center justify-center p-6 sm:p-8 bg-gradient-to-b from-[#09152B]/95 to-[#061124]/95 rounded-3xl border border-slate-700/80 hover:border-amber-400/80 shadow-2xl cursor-pointer hover:scale-[1.03] active:scale-95 transition-all text-center group"
                        >
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-600 shadow-[0_0_30px_rgba(245,158,11,0.5)] flex items-center justify-center mb-4 group-hover:shadow-[0_0_40px_rgba(245,158,11,0.8)] transition-all">
                                <span className="text-3xl sm:text-4xl">💰</span>
                            </div>
                            <h3 className="text-lg font-black text-white mb-1 group-hover:text-amber-300 transition-colors">
                                {language === 'ta-IN' ? "விற்பனை வரலாறு & வருவாய்" : "Sales History & Earnings"}
                            </h3>
                            <p className="text-xs text-gray-400 font-medium">
                                {language === 'ta-IN' ? "ஆர்டர் பதிவுகள் & மொத்த வருவாய்" : "Complete order logs & earnings"}
                            </p>
                        </div>
                    </div>

                    {/* Quick Helper Banner */}
                    <div className="bg-[#0A1326]/75 border border-slate-800 rounded-2xl p-4 flex items-center gap-3 text-xs text-gray-400">
                        <span className="text-xl">💡</span>
                        <p>
                            {language === 'ta-IN' 
                                ? "கீழே உள்ள மைக்கை 2-முறை தட்டி 'விற்பனை', 'பொருட்கள்' அல்லது 'வரலாறு' என்று கூறி விரைவாக செல்லலாம்."
                                : "Double-tap the microphone below and say 'New Sale', 'Products', or 'History' to navigate."}
                        </p>
                    </div>
                </div>

                {/* ─── 2. RIGHT COLUMN: DEDICATED SIDE PANEL CONTENT BOX (STANDALONE SCROLLBAR) ─── */}
                {hasActiveOrders && (
                    <div className="lg:col-span-5 xl:col-span-4 w-full">
                        <div className="bg-gradient-to-b from-[#0B172C]/98 via-[#061324]/98 to-[#040E1B]/98 border-2 border-cyan-500/50 rounded-3xl p-5 shadow-[0_12px_45px_rgba(0,0,0,0.7)] backdrop-blur-2xl flex flex-col sticky top-6">
                            
                            {/* Side Panel Header */}
                            <div className="flex items-center justify-between pb-3.5 border-b border-cyan-500/25 mb-3.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl animate-bounce">🔔</span>
                                    <div>
                                        <h3 className="text-base font-black text-white">
                                            {language === 'ta-IN' ? "புதிய & செயலில் உள்ள ஆர்டர்கள்" : "Incoming & Active Orders"}
                                        </h3>
                                        <p className="text-[11px] text-cyan-300/70">
                                            {language === 'ta-IN' ? "ஆர்டர் நிறைவேற்ற பக்க பலகை" : "Dedicated fulfillment side panel"}
                                        </p>
                                    </div>
                                </div>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                                    <span>{totalActiveOrdersCount}</span>
                                </span>
                            </div>

                            {/* ─── SCROLLABLE ORDERS CONTAINER WITH INDEPENDENT SCROLLBAR ─── */}
                            <div className="max-h-[540px] overflow-y-auto pr-1.5 space-y-3.5 side-panel-scrollbar">
                                
                                {/* A. Auto-clearing celebration toast when buyer accepts order */}
                                {recentCompletedOrder && (
                                    <div className="bg-gradient-to-r from-emerald-950/90 to-emerald-900/90 border border-emerald-400/70 rounded-2xl p-4 shadow-lg animate-in fade-in flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-2.5">
                                            <span className="text-2xl">🎉</span>
                                            <div>
                                                <p className="text-emerald-300 font-extrabold text-sm">
                                                    {language === 'ta-IN' ? "வாங்குபவர் ஆர்டரை ஏற்றுக்கொண்டார்!" : "Buyer Accepted Order!"}
                                                </p>
                                                <p className="text-xs text-gray-200 mt-0.5">
                                                    {translateField(recentCompletedOrder.item_title, language)} • Order #{recentCompletedOrder.order_id}
                                                </p>
                                                <p className="text-amber-300 font-black text-sm mt-1">
                                                    💰 ₹{recentCompletedOrder.total_amount} {language === 'ta-IN' ? "கணக்கில் வரவு வைக்கப்பட்டது" : "credited"}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setRecentCompletedOrder(null)}
                                            className="text-gray-400 hover:text-white text-xs p-1 rounded-md hover:bg-emerald-800/40"
                                            title="Dismiss"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )}

                                {/* B. Pending Orders (Incoming Buyer Orders needing to be packed) */}
                                {unDismissedPendingOrders.map(order => (
                                    <div 
                                        key={`pending-${order.order_id}`}
                                        className="bg-[#0A1426] border-2 border-amber-500/70 rounded-2xl p-4 shadow-lg flex flex-col gap-3 hover:border-amber-400 transition-all"
                                    >
                                        <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                                            <span className="bg-amber-950/90 border border-amber-500 text-amber-300 text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                                <span>📦</span>
                                                <span>{language === 'ta-IN' ? "பேக் செய்ய வேண்டும்" : "Needs Packing"}</span>
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-400 font-mono">#{order.order_id}</span>
                                                <button
                                                    onClick={() => setDismissedOrderIds(prev => new Set(prev).add(order.order_id))}
                                                    className="text-gray-500 hover:text-gray-300 text-xs px-1 hover:bg-white/10 rounded"
                                                    title="Dismiss"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="text-lg font-black text-white">
                                                {translateField(order.item_title, language)}
                                            </h4>
                                            <div className="flex items-center justify-between mt-1 text-xs text-gray-300">
                                                <span>👤 {translateField(order.buyer_name, language)}</span>
                                                <span className="text-emerald-400 font-extrabold text-base">₹{order.total_amount}</span>
                                            </div>
                                            <p className="text-xs text-amber-300/90 mt-1">
                                                ⚖️ {language === 'ta-IN' ? "அளவு:" : "Qty:"} <span className="text-white font-bold">{order.quantity} {translateField(order.unit, language)}</span> • 📍 {translateField(order.buyer_village || 'Hub', language)}
                                            </p>
                                        </div>

                                        {/* Action Button: Pack Order */}
                                        <button
                                            onClick={() => initiatePackOrder(order)}
                                            className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-gray-950 font-black rounded-xl shadow-md transform hover:scale-[1.02] active:scale-95 transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            <span className="text-base">📦</span>
                                            <span>{t.packOrderBtn || "Pack Order"}</span>
                                        </button>
                                    </div>
                                ))}

                                {/* C. Active Fulfillment Orders (Packed, Scheduled, Moving) */}
                                {activeFulfillmentOrders.map(order => {
                                    const isPacked = order.status === 'order_packed';
                                    const isScheduled = order.status === 'pickup_scheduled';
                                    const isMoving = order.status === 'package_moving';

                                    return (
                                        <div 
                                            key={`fulfillment-${order.order_id}`}
                                            className={`rounded-2xl p-4 border-2 transition-all shadow-lg flex flex-col gap-3 ${
                                                isMoving 
                                                    ? 'bg-[#14082B]/95 border-purple-400/80 shadow-[0_0_25px_rgba(168,85,247,0.25)]' 
                                                    : isScheduled 
                                                    ? 'bg-[#06182B]/95 border-cyan-400/80 shadow-[0_0_25px_rgba(6,182,212,0.25)]' 
                                                    : 'bg-[#1C1304]/95 border-amber-400/80 shadow-[0_0_25px_rgba(245,158,11,0.25)]'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                                                <span className={`text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                                                    isMoving 
                                                        ? 'bg-purple-950 text-purple-300 border-purple-500 animate-pulse' 
                                                        : isScheduled 
                                                        ? 'bg-cyan-950 text-cyan-300 border-cyan-500' 
                                                        : 'bg-amber-950 text-amber-300 border-amber-500'
                                                }`}>
                                                    {translateField(order.status_localized || order.status, language)}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-400 font-mono">#{order.order_id}</span>
                                                    <button
                                                        onClick={() => setDismissedOrderIds(prev => new Set(prev).add(order.order_id))}
                                                        className="text-gray-500 hover:text-gray-300 text-xs px-1 hover:bg-white/10 rounded"
                                                        title="Dismiss"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-base font-black text-white">
                                                        {translateField(order.item_title, language)}
                                                    </h4>
                                                    <span className="text-amber-400 font-black text-base">₹{order.total_amount}</span>
                                                </div>
                                                <p className="text-xs text-gray-300 mt-0.5">
                                                    👤 {translateField(order.buyer_name, language)} • 📦 {order.quantity} {translateField(order.unit, language)}
                                                </p>
                                            </div>

                                            {/* Stage A: Packed -> Schedule Pickup Button */}
                                            {isPacked && (
                                                <div className="space-y-2">
                                                    <p className="text-[11px] text-amber-200/90 leading-tight">
                                                        {language === 'ta-IN' ? "பொருட்கள் தயார். வாகன பிக்-அப்பை திட்டமிடவும்." : "Package ready. Schedule pickup van."}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => initiateSchedulePickup(order)}
                                                        className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 via-teal-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black rounded-xl shadow-md transform hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm"
                                                    >
                                                        <span className="text-base">🚚</span>
                                                        <span>{t.schedulePickupBtn || "Schedule Pickup"}</span>
                                                    </button>
                                                </div>
                                            )}

                                            {/* Stage B: Pickup Scheduled -> Handover / Dispatch Button */}
                                            {isScheduled && (
                                                <div className="space-y-2.5">
                                                    <div className="bg-[#071326] p-2.5 rounded-xl border border-slate-700/80 text-[11px] space-y-1">
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-400">{t.trackingIdLabel || "Tracking ID"}:</span>
                                                            <span className="text-cyan-300 font-mono font-bold">{order.tracking_id}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-400">{t.pickupTimeLabel || "Window"}:</span>
                                                            <span className="text-amber-300 font-bold">{translateField(order.pickup_time, language)}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => commitDispatchOrder(order.order_id)}
                                                        className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-95"
                                                    >
                                                        <span>🚀</span>
                                                        <span>{t.dispatchVanBtn || "Handover & Dispatch"}</span>
                                                    </button>
                                                </div>
                                            )}

                                            {/* Stage C: Moving in Transit */}
                                            {isMoving && (
                                                <div className="bg-[#190C36] p-2.5 rounded-xl border border-purple-500/40 text-[11px] space-y-1">
                                                    <div className="flex items-center gap-2 text-purple-300 font-bold">
                                                        <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
                                                        <span>{language === 'ta-IN' ? "பார்சல் வாகனத்தில் பயணிக்கிறது" : "In transit on logistics van"}</span>
                                                    </div>
                                                    <p className="text-gray-300 text-[11px]">
                                                        {t.trackingIdLabel || "Tracking"}: <span className="font-mono text-purple-200">{order.tracking_id}</span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Side Panel Footer */}
                            <div className="pt-3 mt-3 border-t border-cyan-500/20 text-[11px] text-cyan-300/80 flex items-center justify-between">
                                <span>🎙️ {language === 'ta-IN' ? "மைக்கில் பேசி இயக்கலாம்" : "Voice commands enabled"}</span>
                                <span>📜 {language === 'ta-IN' ? "தனி ஸ்க்ரோல் பார்" : "Separate scroll"}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── STEP 4: VOICE CONFIRMATION GUARDRAIL MODAL ─── */}
            {guardrailAction && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-[#0B152B] border-2 border-amber-400 rounded-3xl p-6 md:p-8 max-w-lg w-full text-center shadow-[0_0_50px_rgba(245,158,11,0.6)] animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 rounded-full bg-amber-400/20 border-2 border-amber-400 text-amber-400 text-3xl flex items-center justify-center mx-auto mb-4">
                            🛡️
                        </div>

                        <h3 className="text-2xl font-black text-white mb-2">
                            {t.guardrailTitle || "Action Confirmation"}
                        </h3>

                        <div className="bg-[#070F1E] border border-slate-700 rounded-2xl p-4 my-4 text-left space-y-1.5">
                            <p className="text-white font-bold text-base">
                                📦 {translateField(guardrailAction.order?.item_title, language)}
                            </p>
                            <p className="text-gray-300 text-sm">
                                👤 {translateField(guardrailAction.order?.buyer_name, language)} ({translateField(guardrailAction.order?.buyer_village, language)}) • {guardrailAction.order?.quantity} {translateField(guardrailAction.order?.unit, language)}
                            </p>
                            <p className="text-amber-400 font-black text-xl">
                                💰 ₹{guardrailAction.order?.total_amount}
                            </p>
                        </div>

                        <p className="text-cyan-200 font-bold text-base mb-6 leading-relaxed">
                            {guardrailAction.prompt}
                            <br />
                            <span className="text-amber-300 text-xs">
                                🎙️ {language === 'ta-IN' ? "உறுதி செய்ய 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்" : "Say 'Yes' to confirm or 'No' to cancel into mic"}
                            </span>
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => {
                                    if (guardrailAction.type === 'pack_order') {
                                        commitPackOrder(guardrailAction.order.order_id);
                                    } else if (guardrailAction.type === 'schedule_pickup') {
                                        commitSchedulePickup(guardrailAction.order.order_id);
                                    } else if (guardrailAction.type === 'dispatch_order') {
                                        commitDispatchOrder(guardrailAction.order.order_id);
                                    }
                                }}
                                disabled={isActionProcessing}
                                className="py-3.5 px-6 rounded-xl font-black text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span>✅</span>
                                <span>{t.confirmYes || "Yes (Confirm)"}</span>
                            </button>

                            <button
                                type="button"
                                onClick={cancelGuardrail}
                                disabled={isActionProcessing}
                                className="py-3.5 px-6 rounded-xl font-bold text-gray-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span>❌</span>
                                <span>{t.cancelNo || "No (Cancel)"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── STATELESS VOICE-FIRST AI MARKET ASSISTANT ─── */}
            <MarketAssistantWidget language={language} userRole="seller" />
        </div>
    );
};

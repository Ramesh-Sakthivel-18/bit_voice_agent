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
        return (
            <SellerCommerceView 
                language={language} 
                user={user} 
                onBack={() => setViewMode('dashboard')} 
                onViewListings={() => setViewMode('listings')} 
            />
        );
    }

    if (viewMode === 'listings') {
        return <SellerListings language={language} user={user} onBack={() => setViewMode('dashboard')} />;
    }

    if (viewMode === 'history') {
        return <SellerOrderHistory language={language} user={user} onBack={() => setViewMode('dashboard')} />;
    }

    return (
        <div className={`w-full ${hasActiveOrders ? 'max-w-7xl' : 'max-w-5xl'} mx-auto flex flex-col items-center p-4 sm:p-6 text-slate-900 pb-36 relative transition-all duration-300`}>
            {/* Header Bar */}
            <div className="w-full flex flex-col md:flex-row justify-between items-center mb-6 sm:mb-8 gap-4 border-b border-slate-200 pb-5">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black text-slate-900 text-center md:text-left">
                        {language === 'ta-IN' ? "வணக்கம்" : "Welcome"}, <span className="text-amber-600">{translateField(user.name, language)}!</span>
                    </h1>
                    <p className="text-slate-600 text-xs sm:text-sm mt-1 text-center md:text-left">
                        📍 {translateField(user.village || 'Tamil Nadu', language)} • 🌾 {language === 'ta-IN' ? "விற்பனையாளர் டாஷ்போர்டு" : "Producer Dashboard"}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setViewMode('history')}
                        className="px-4 py-2 bg-white hover:bg-slate-50 text-emerald-800 font-bold rounded-xl text-xs shadow-sm transition-colors border border-slate-200 flex items-center gap-1.5 cursor-pointer"
                    >
                        <span>💰</span>
                        <span>{language === 'ta-IN' ? "வருவாய் & வரலாறு" : "Earnings & History"}</span>
                    </button>
                    <button 
                        onClick={() => {
                            sessionStorage.clear();
                            window.location.href = '/';
                        }}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-sm transition-colors cursor-pointer"
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
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                            <span>⚡</span>
                            <span>{language === 'ta-IN' ? "முதன்மை செயல்பாடுகள்" : "Core Dashboard Actions"}</span>
                        </h2>
                        {hasActiveOrders && (
                            <span className="text-xs text-blue-900 font-bold bg-blue-50 px-3 py-1 rounded-full border border-blue-200 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
                                <span>{language === 'ta-IN' ? "பக்க பேனலில் ஆர்டர்கள் உள்ளன" : "Orders in side panel"}</span>
                            </span>
                        )}
                    </div>

                    {/* 3 Core Action Tiles */}
                    <div className={`grid grid-cols-1 ${hasActiveOrders ? 'sm:grid-cols-3' : 'md:grid-cols-3'} gap-5 w-full`}>
                        {/* Tile 1: New Sale */}
                        <div 
                            onClick={() => setViewMode('commerce')}
                            className="flex flex-col items-center justify-center p-6 sm:p-8 bg-white rounded-3xl border-2 border-slate-200 hover:border-blue-500 shadow-sm hover:shadow-md cursor-pointer hover:scale-[1.03] active:scale-95 transition-all text-center group"
                        >
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-md flex items-center justify-center mb-4 transition-all">
                                <span className="text-3xl sm:text-4xl">🏷️</span>
                            </div>
                            <h3 className="text-lg font-black text-slate-900 mb-1 group-hover:text-blue-700 transition-colors">
                                {language === 'ta-IN' ? "புதிய விற்பனை" : "New Listing"}
                            </h3>
                            <p className="text-xs text-slate-600 font-medium">
                                {language === 'ta-IN' ? "குரல் அல்லது தட்டச்சு வழியே பதிவு" : "Dual-mode voice & typing wizard"}
                            </p>
                        </div>

                        {/* Tile 2: My Listings */}
                        <div 
                            onClick={() => setViewMode('listings')}
                            className="flex flex-col items-center justify-center p-6 sm:p-8 bg-white rounded-3xl border-2 border-slate-200 hover:border-emerald-500 shadow-sm hover:shadow-md cursor-pointer hover:scale-[1.03] active:scale-95 transition-all text-center group"
                        >
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 shadow-md flex items-center justify-center mb-4 transition-all">
                                <span className="text-3xl sm:text-4xl">📋</span>
                            </div>
                            <h3 className="text-lg font-black text-slate-900 mb-1 group-hover:text-emerald-700 transition-colors">
                                {language === 'ta-IN' ? "என் விற்பனைப் பொருட்கள்" : "My Active Listings"}
                            </h3>
                            <p className="text-xs text-slate-600 font-medium">
                                {language === 'ta-IN' ? "இருப்பு மற்றும் விலையை நிர்வகிக்க" : "Manage active items & stock"}
                            </p>
                        </div>

                        {/* Tile 3: Sales History & Earnings */}
                        <div 
                            onClick={() => setViewMode('history')}
                            className="flex flex-col items-center justify-center p-6 sm:p-8 bg-white rounded-3xl border-2 border-slate-200 hover:border-amber-500 shadow-sm hover:shadow-md cursor-pointer hover:scale-[1.03] active:scale-95 transition-all text-center group"
                        >
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-600 shadow-md flex items-center justify-center mb-4 transition-all">
                                <span className="text-3xl sm:text-4xl">💰</span>
                            </div>
                            <h3 className="text-lg font-black text-slate-900 mb-1 group-hover:text-amber-700 transition-colors">
                                {language === 'ta-IN' ? "விற்பனை வரலாறு & வருவாய்" : "Sales History & Earnings"}
                            </h3>
                            <p className="text-xs text-slate-600 font-medium">
                                {language === 'ta-IN' ? "ஆர்டர் பதிவுகள் & மொத்த வருவாய்" : "Complete order logs & earnings"}
                            </p>
                        </div>
                    </div>

                    {/* Quick Helper Banner */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-3 text-xs text-slate-600">
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
                        <div className="bg-white border-2 border-slate-200 rounded-3xl p-5 shadow-xl backdrop-blur-2xl flex flex-col sticky top-6">
                            
                            {/* Side Panel Header */}
                            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-3.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl animate-bounce">🔔</span>
                                    <div>
                                        <h3 className="text-base font-black text-slate-900">
                                            {language === 'ta-IN' ? "புதிய & செயலில் உள்ள ஆர்டர்கள்" : "Incoming & Active Orders"}
                                        </h3>
                                        <p className="text-[11px] text-slate-500">
                                            {language === 'ta-IN' ? "ஆர்டர் நிறைவேற்ற பக்க பலகை" : "Dedicated fulfillment side panel"}
                                        </p>
                                    </div>
                                </div>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
                                    <span>{totalActiveOrdersCount}</span>
                                </span>
                            </div>

                            {/* ─── SCROLLABLE ORDERS CONTAINER WITH INDEPENDENT SCROLLBAR ─── */}
                            <div className="max-h-[540px] overflow-y-auto pr-1.5 space-y-3.5 side-panel-scrollbar">
                                
                                {/* A. Auto-clearing celebration toast when buyer accepts order */}
                                {recentCompletedOrder && (
                                    <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 shadow-sm animate-in fade-in flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-2.5">
                                            <span className="text-2xl">🎉</span>
                                            <div>
                                                <p className="text-emerald-800 font-extrabold text-sm">
                                                    {language === 'ta-IN' ? "வாங்குபவர் ஆர்டரை ஏற்றுக்கொண்டார்!" : "Buyer Accepted Order!"}
                                                </p>
                                                <p className="text-xs text-slate-700 mt-0.5">
                                                    {translateField(recentCompletedOrder.item_title, language)} • Order #{recentCompletedOrder.order_id}
                                                </p>
                                                <p className="text-amber-700 font-black text-sm mt-1">
                                                    💰 ₹{recentCompletedOrder.total_amount} {language === 'ta-IN' ? "கணக்கில் வரவு வைக்கப்பட்டது" : "credited"}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setRecentCompletedOrder(null)}
                                            className="text-slate-400 hover:text-slate-700 text-xs p-1 rounded-md hover:bg-emerald-100"
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
                                        className="bg-white border-2 border-amber-400 rounded-2xl p-4 shadow-sm flex flex-col gap-3 hover:border-amber-500 transition-all"
                                    >
                                        <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                                            <span className="bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                                <span>📦</span>
                                                <span>{language === 'ta-IN' ? "பேக் செய்ய வேண்டும்" : "Needs Packing"}</span>
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-400 font-mono">#{order.order_id}</span>
                                                <button
                                                    onClick={() => setDismissedOrderIds(prev => new Set(prev).add(order.order_id))}
                                                    className="text-slate-400 hover:text-slate-700 text-xs px-1 hover:bg-slate-100 rounded"
                                                    title="Dismiss"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="text-lg font-black text-slate-900">
                                                {translateField(order.item_title, language)}
                                            </h4>
                                            <div className="flex items-center justify-between mt-1 text-xs text-slate-600">
                                                <span>👤 {translateField(order.buyer_name, language)}</span>
                                                <span className="text-emerald-700 font-extrabold text-base">₹{order.total_amount}</span>
                                            </div>
                                            <p className="text-xs text-amber-800 mt-1">
                                                ⚖️ {language === 'ta-IN' ? "அளவு:" : "Qty:"} <span className="text-slate-900 font-bold">{order.quantity} {translateField(order.unit, language)}</span> • 📍 {translateField(order.buyer_village || 'Hub', language)}
                                            </p>
                                        </div>

                                        {/* Action Button: Pack Order */}
                                        <button
                                            onClick={() => initiatePackOrder(order)}
                                            className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-white font-black rounded-xl shadow-sm transform hover:scale-[1.02] active:scale-95 transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
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
                                            className={`rounded-2xl p-4 border-2 transition-all shadow-sm flex flex-col gap-3 ${
                                                isMoving 
                                                    ? 'bg-purple-50/60 border-purple-300' 
                                                    : isScheduled 
                                                    ? 'bg-blue-50/60 border-blue-300' 
                                                    : 'bg-amber-50/60 border-amber-300'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                                <span className={`text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                                                    isMoving 
                                                        ? 'bg-purple-100 text-purple-800 border-purple-300 animate-pulse' 
                                                        : isScheduled 
                                                        ? 'bg-blue-100 text-blue-800 border-blue-300' 
                                                        : 'bg-amber-100 text-amber-800 border-amber-300'
                                                }`}>
                                                    {translateField(order.status_localized || order.status, language)}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-400 font-mono">#{order.order_id}</span>
                                                    <button
                                                        onClick={() => setDismissedOrderIds(prev => new Set(prev).add(order.order_id))}
                                                        className="text-slate-400 hover:text-slate-700 text-xs px-1 hover:bg-slate-100 rounded"
                                                        title="Dismiss"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-base font-black text-slate-900">
                                                        {translateField(order.item_title, language)}
                                                    </h4>
                                                    <span className="text-amber-700 font-black text-base">₹{order.total_amount}</span>
                                                </div>
                                                <p className="text-xs text-slate-600 mt-0.5">
                                                    👤 {translateField(order.buyer_name, language)} • 📦 {order.quantity} {translateField(order.unit, language)}
                                                </p>
                                            </div>

                                            {/* Stage A: Packed -> Schedule Pickup Button */}
                                            {isPacked && (
                                                <div className="space-y-2">
                                                    <p className="text-[11px] text-amber-900 leading-tight">
                                                        {language === 'ta-IN' ? "பொருட்கள் தயார். வாகன பிக்-அப்பை திட்டமிடவும்." : "Package ready. Schedule pickup van."}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => initiateSchedulePickup(order)}
                                                        className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 via-teal-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-black rounded-xl shadow-sm transform hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm"
                                                    >
                                                        <span className="text-base">🚚</span>
                                                        <span>{t.schedulePickupBtn || "Schedule Pickup"}</span>
                                                    </button>
                                                </div>
                                            )}

                                            {/* Stage B: Pickup Scheduled -> Handover / Dispatch Button */}
                                            {isScheduled && (
                                                <div className="space-y-2.5">
                                                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-[11px] space-y-1">
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-500">{t.trackingIdLabel || "Tracking ID"}:</span>
                                                            <span className="text-blue-700 font-mono font-bold">{order.tracking_id}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-500">{t.pickupTimeLabel || "Window"}:</span>
                                                            <span className="text-amber-700 font-bold">{translateField(order.pickup_time, language)}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => commitDispatchOrder(order.order_id)}
                                                        className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-95"
                                                    >
                                                        <span>🚀</span>
                                                        <span>{t.dispatchVanBtn || "Handover & Dispatch"}</span>
                                                    </button>
                                                </div>
                                            )}

                                            {/* Stage C: Moving in Transit */}
                                            {isMoving && (
                                                <div className="bg-white p-2.5 rounded-xl border border-purple-200 text-[11px] space-y-1">
                                                    <div className="flex items-center gap-2 text-purple-800 font-bold">
                                                        <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping"></span>
                                                        <span>{language === 'ta-IN' ? "பார்சல் வாகனத்தில் பயணிக்கிறது" : "In transit on logistics van"}</span>
                                                    </div>
                                                    <p className="text-slate-600 text-[11px]">
                                                        {t.trackingIdLabel || "Tracking"}: <span className="font-mono text-purple-700">{order.tracking_id}</span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Side Panel Footer */}
                            <div className="pt-3 mt-3 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                                <span>🎙️ {language === 'ta-IN' ? "மைக்கில் பேசி இயக்கலாம்" : "Voice commands enabled"}</span>
                                <span>📜 {language === 'ta-IN' ? "தனி ஸ்க்ரோல் பார்" : "Separate scroll"}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── STEP 4: VOICE CONFIRMATION GUARDRAIL MODAL ─── */}
            {guardrailAction && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white border-2 border-amber-500 rounded-3xl p-6 md:p-8 max-w-lg w-full text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-500 text-amber-700 text-3xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                            🛡️
                        </div>

                        <h3 className="text-2xl font-black text-slate-900 mb-2">
                            {t.guardrailTitle || "Action Confirmation"}
                        </h3>

                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 my-4 text-left space-y-1.5">
                            <p className="text-slate-900 font-bold text-base">
                                📦 {translateField(guardrailAction.order?.item_title, language)}
                            </p>
                            <p className="text-slate-600 text-sm">
                                👤 {translateField(guardrailAction.order?.buyer_name, language)} ({translateField(guardrailAction.order?.buyer_village, language)}) • {guardrailAction.order?.quantity} {translateField(guardrailAction.order?.unit, language)}
                            </p>
                            <p className="text-amber-700 font-black text-xl">
                                💰 ₹{guardrailAction.order?.total_amount}
                            </p>
                        </div>

                        <p className="text-slate-800 font-bold text-base mb-6 leading-relaxed">
                            {guardrailAction.prompt}
                            <br />
                            <span className="text-amber-700 text-xs mt-1 block">
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
                                className="py-3.5 px-6 rounded-xl font-black text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span>✅</span>
                                <span>{t.confirmYes || "Yes (Confirm)"}</span>
                            </button>

                            <button
                                type="button"
                                onClick={cancelGuardrail}
                                disabled={isActionProcessing}
                                className="py-3.5 px-6 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
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

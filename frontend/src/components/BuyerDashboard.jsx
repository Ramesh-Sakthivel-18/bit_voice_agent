import React, { useEffect, useState } from 'react';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { BuyerCommerceView } from './BuyerCommerceView';
import { BuyerOrderHistory } from './BuyerOrderHistory';
import { MarketAssistantWidget } from './MarketAssistantWidget';
import { getTranslation, translateField } from '../utils/translations';
import { 
    isSearchIntent, 
    isLogoutIntent, 
    isHomeIntent,
    isOrderHistoryIntent,
    matchesAnyKeyword,
    BUYER_SEARCH_KEYWORDS 
} from '../utils/voiceMatcher';

export const BuyerDashboard = ({ language, user }) => {
    const { 
        setPageContext, 
        setScreenInstruction, 
        setGuidePrompt, 
        speak, 
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();
    
    const t = getTranslation(language);
    const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' | 'commerce' | 'history'

    useEffect(() => {
        if (viewMode !== 'dashboard') return;

        const pageCtx = language === 'ta-IN' ? "வாங்குபவர் முகப்பு / Buyer Home" : "Buyer Home";
        setPageContext(pageCtx);

        const instruction = t.screenBuyerDashboard || (
            language === 'ta-IN'
                ? "வாங்குபவர் முகப்பு. பொருட்களைத் தேட அல்லது ஆர்டர் வரலாற்றைக் காண கீழே உள்ள மைக்ரோஃபோனை தட்டுங்கள்."
                : "Buyer Home. Double-tap bottom mic to search products or view your order history."
        );
        setScreenInstruction(instruction);

        const guide = t.buyerGuidePrompt || (
            language === 'ta-IN'
                ? "பொருட்களைத் தேட 'தேடு' என்று சொல்லுங்கள், அல்லது உங்கள் ஆர்டர்களைக் காண 'வரலாறு' என்று சொல்லுங்கள்."
                : "Say 'Search' to find products, or 'Order History' to track your purchases."
        );
        setGuidePrompt(guide);

        // Auto greeting once
        const greet = language === 'ta-IN' ? `வணக்கம் ${translateField(user.name, language)}` : `Welcome ${user.name}`;
        speak(greet, language);

        // Voice command handler
        const handleVoiceInput = (text) => {
            if (!text) return;
            console.log("[Buyer Dashboard Voice Input]:", text);

            if (isOrderHistoryIntent(text)) {
                const navMsg = language === 'ta-IN' ? "உங்கள் ஆர்டர் வரலாறு பக்கத்திற்குச் செல்கிறது..." : "Navigating to Order History...";
                speak(navMsg, language);
                setViewMode('history');
            } else if (isSearchIntent(text) || matchesAnyKeyword(text, ['தேன்', 'மஞ்சள்', 'honey', 'turmeric', 'spices', 'பொருள்', 'வாங்கு'])) {
                const navMsg = t.navigatingToSearch || (
                    language === 'ta-IN' ? "பொருட்கள் தேடல் பக்கத்திற்குச் செல்கிறது..." : "Navigating to Product Search..."
                );
                speak(navMsg, language);
                setViewMode('commerce');
            } else if (isLogoutIntent(text)) {
                sessionStorage.clear();
                window.location.href = '/';
            }
        };

        registerVoiceHandler(handleVoiceInput);
        return () => {
            unregisterVoiceHandler();
            setPageContext('');
        };
    }, [viewMode, language, user.name, t, setPageContext, setScreenInstruction, setGuidePrompt, speak, registerVoiceHandler, unregisterVoiceHandler]);

    if (viewMode === 'commerce') {
        return <BuyerCommerceView language={language} user={user} onBack={() => setViewMode('dashboard')} />;
    }

    if (viewMode === 'history') {
        return <BuyerOrderHistory language={language} user={user} onBack={() => setViewMode('dashboard')} />;
    }

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center p-6 text-slate-900 pb-36 relative">
            {/* Header Actions */}
            <div className="absolute top-6 right-6 flex items-center gap-3">
                <button
                    onClick={() => setViewMode('history')}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-blue-700 font-bold rounded-xl text-xs shadow-sm transition-colors border border-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                    <span>📜</span>
                    <span>{language === 'ta-IN' ? "ஆர்டர் வரலாறு" : "My Orders"}</span>
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

            <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-2 mt-4 text-center">
                {language === 'ta-IN' ? "வணக்கம்" : "Welcome"}, <span className="text-amber-600">{translateField(user.name, language)}!</span>
            </h1>
            <p className="text-slate-600 text-sm mb-8 text-center">
                📍 {translateField(user.village || 'Tamil Nadu', language)} • 🛒 {language === 'ta-IN' ? "வாங்குபவர் டாஷ்போர்டு" : "Buyer Dashboard"}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full mb-10">
                <div className="bg-white p-5 rounded-2xl border-l-4 border-purple-500 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="text-3xl">🛒</div>
                    <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Role</p>
                        <p className="text-slate-900 text-lg font-bold capitalize">{user.role}</p>
                    </div>
                </div>
                
                <div className="bg-white p-5 rounded-2xl border-l-4 border-blue-500 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="text-3xl">📍</div>
                    <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Location</p>
                        <p className="text-slate-900 text-lg font-bold capitalize">{translateField(user.village || 'N/A', language)}</p>
                    </div>
                </div>
                
                <div className="bg-white p-5 rounded-2xl border-l-4 border-emerald-500 border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="text-3xl">📞</div>
                    <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Phone</p>
                        <p className="text-slate-900 text-lg font-bold">{user.phone || 'N/A'}</p>
                    </div>
                </div>
            </div>

            {/* Central Action Cards: 1. Search Products, 2. My Orders & Tracking */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
                {/* Search & Buy Products Card */}
                <div 
                    onClick={() => setViewMode('commerce')}
                    className="flex flex-col items-center justify-center p-8 bg-white rounded-3xl border-2 border-slate-200 shadow-sm hover:shadow-md cursor-pointer hover:border-blue-500 hover:scale-[1.02] transition-all group text-center"
                >
                    <div className="w-20 h-20 mb-4 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-md flex items-center justify-center">
                        <span className="text-4xl">🔍</span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">
                        {language === 'ta-IN' ? "பொருட்களை தேடுங்கள்" : "Search & Buy"}
                    </h2>
                    <p className="text-slate-600 text-xs leading-relaxed">
                        {language === 'ta-IN' 
                            ? "இயற்கை தேன், மஞ்சள், மூலிகைகள் தேடவும், அளவை தேர்வு செய்து வாங்கவும்" 
                            : "Browse forest honey, turmeric & spices direct from tribal farmers"}
                    </p>
                </div>

                {/* My Orders & Tracking Card */}
                <div 
                    onClick={() => setViewMode('history')}
                    className="flex flex-col items-center justify-center p-8 bg-white rounded-3xl border-2 border-slate-200 shadow-sm hover:shadow-md cursor-pointer hover:border-emerald-500 hover:scale-[1.02] transition-all group text-center"
                >
                    <div className="w-20 h-20 mb-4 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 shadow-md flex items-center justify-center">
                        <span className="text-4xl">📜</span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">
                        {language === 'ta-IN' ? "என் ஆர்டர்கள் & நிலை" : "My Orders & Tracking"}
                    </h2>
                    <p className="text-slate-600 text-xs leading-relaxed">
                        {language === 'ta-IN' 
                            ? "நேரடி பார்சல் கண்காணிப்பு, பயண நிலை மற்றும் பொருள் வரவு உறுதிப்படுத்தல்" 
                            : "Track real-time package movement and confirm delivery receipt"}
                    </p>
                </div>
            </div>

            {/* ─── STATELESS VOICE-FIRST AI MARKET ASSISTANT ─── */}
            <MarketAssistantWidget language={language} userRole="buyer" />
        </div>
    );
};


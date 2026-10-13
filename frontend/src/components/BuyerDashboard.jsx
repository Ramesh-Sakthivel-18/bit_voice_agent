import React, { useEffect, useState } from 'react';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { BuyerCommerceView } from './BuyerCommerceView';
import { getTranslation } from '../utils/translations';
import { 
    isSearchIntent, 
    isLogoutIntent, 
    isHomeIntent,
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
    const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' | 'commerce'

    useEffect(() => {
        if (viewMode !== 'dashboard') return;

        const pageCtx = language === 'ta-IN' ? "வாங்குபவர் முகப்பு / Buyer Home" : "Buyer Home";
        setPageContext(pageCtx);

        const instruction = t.screenBuyerDashboard || (
            language === 'ta-IN'
                ? "வாங்குபவர் முகப்பு. பொருட்களைத் தேட கீழே உள்ள மைக்ரோஃபோனை தட்டுங்கள்."
                : "Buyer Home. Double-tap bottom mic to search products."
        );
        setScreenInstruction(instruction);

        const guide = t.buyerGuidePrompt || (
            language === 'ta-IN'
                ? "பொருட்களைத் தேட 'தேடு' என்று சொல்லுங்கள், அல்லது நீங்கள் வாங்க விரும்பும் தேன், மஞ்சள் போன்ற பொருளின் பெயரைக் கூறுங்கள்."
                : "Say 'Search' to find products, or speak the item name like Honey or Turmeric."
        );
        setGuidePrompt(guide);

        // Auto greeting once
        const greet = language === 'ta-IN' ? `வணக்கம் ${user.name}` : `Welcome ${user.name}`;
        speak(greet, language);

        // Voice command handler
        const handleVoiceInput = (text) => {
            if (!text) return;
            console.log("[Buyer Dashboard Voice Input]:", text);

            if (isSearchIntent(text) || matchesAnyKeyword(text, ['தேன்', 'மஞ்சள்', 'honey', 'turmeric', 'spices', 'பொருள்'])) {
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

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center p-6 text-white pb-36 relative">
            {/* Logout button */}
            <button 
                onClick={() => {
                    sessionStorage.clear();
                    window.location.href = '/';
                }}
                className="absolute top-6 right-6 px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white font-bold rounded-xl text-xs shadow-lg transition-colors border border-red-500/50"
            >
                {language === 'ta-IN' ? "வெளியேறு" : "Logout"}
            </button>

            <h1 className="text-4xl md:text-5xl font-black text-white mb-2 mt-4 text-center">
                {language === 'ta-IN' ? "வணக்கம்" : "Welcome"}, <span className="text-amber-400">{user.name}!</span>
            </h1>
            <p className="text-gray-400 text-sm mb-8 text-center">
                📍 {user.village || 'Tamil Nadu'} • 🛒 {language === 'ta-IN' ? "வாங்குபவர் டாஷ்போர்டு" : "Buyer Dashboard"}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full mb-12">
                <div className="bg-[#0B152B]/80 p-5 rounded-2xl border-l-4 border-purple-500 shadow-xl flex items-center gap-4">
                    <div className="text-3xl">🛒</div>
                    <div>
                        <p className="text-gray-400 text-xs uppercase tracking-wider">Role</p>
                        <p className="text-white text-lg font-bold capitalize">{user.role}</p>
                    </div>
                </div>
                
                <div className="bg-[#0B152B]/80 p-5 rounded-2xl border-l-4 border-cyan-500 shadow-xl flex items-center gap-4">
                    <div className="text-3xl">📍</div>
                    <div>
                        <p className="text-gray-400 text-xs uppercase tracking-wider">Location</p>
                        <p className="text-white text-lg font-bold capitalize">{user.village || 'N/A'}</p>
                    </div>
                </div>
                
                <div className="bg-[#0B152B]/80 p-5 rounded-2xl border-l-4 border-emerald-500 shadow-xl flex items-center gap-4">
                    <div className="text-3xl">📞</div>
                    <div>
                        <p className="text-gray-400 text-xs uppercase tracking-wider">Phone</p>
                        <p className="text-white text-lg font-bold">{user.phone || 'N/A'}</p>
                    </div>
                </div>
            </div>

            {/* Central Product Search Button Card (No mic icons - sleek search action tile) */}
            <div 
                onClick={() => setViewMode('commerce')}
                className="flex flex-col items-center justify-center p-10 bg-gradient-to-b from-[#0C1A3A]/90 to-[#071126]/90 rounded-3xl border border-cyan-500/40 w-full max-w-md shadow-[0_0_45px_rgba(6,182,212,0.2)] cursor-pointer hover:border-cyan-400 hover:scale-[1.02] transition-all group"
            >
                <div className="w-24 h-24 mb-5 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-[0_0_35px_rgba(6,182,212,0.6)] flex items-center justify-center">
                    <span className="text-5xl">🔍</span>
                </div>
                <h2 className="text-2xl font-black text-center text-white mb-2">
                    {language === 'ta-IN' ? "பொருட்களை தேடுங்கள்" : "Search Products"}
                </h2>
                <p className="text-gray-400 text-xs text-center max-w-xs leading-relaxed">
                    {language === 'ta-IN' 
                        ? "தேன், மஞ்சள் அல்லது பிற தயாரிப்புகளைக் கண்டறிய தட்டவும் அல்லது பேசவும்" 
                        : "Find forest honey, turmeric & spices direct from tribal farmers"}
                </p>
            </div>
        </div>
    );
};


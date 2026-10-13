import React, { useState, useEffect, useRef } from 'react';
import { searchBuyerListings, expressBuyerInterest, getBuyerOrderDetails } from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { BuyerCheckout } from './BuyerCheckout';
import { getTranslation } from '../utils/translations';
import { 
    isExpressInterestIntent, 
    isHomeIntent, 
    isSearchIntent, 
    normalizeText,
    matchesAnyKeyword,
    BUYER_SEARCH_KEYWORDS,
    BUYER_EXPRESS_INTEREST_KEYWORDS,
    GLOBAL_HOME_KEYWORDS 
} from '../utils/voiceMatcher';

const BUYER_STATES = {
    IDLE: 0,
    SEARCHING: 1,
    RESULTS: 2
};

export const BuyerCommerceView = ({ language, user, onBack }) => {
    const { 
        setPageContext, 
        setScreenInstruction, 
        setGuidePrompt, 
        speak, 
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();
    
    const t = getTranslation(language);

    const [state, setState] = useState(BUYER_STATES.IDLE);
    const [statusText, setStatusText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState([]);
    const [pendingOrders, setPendingOrders] = useState({}); // listingId -> order
    const [checkoutOrder, setCheckoutOrder] = useState(null);

    const pollingIntervalRef = useRef(null);
    const unmounted = useRef(false);

    // Set page context badge and screen instructions on mount
    useEffect(() => {
        const pageCtx = language === 'ta-IN' ? "தேடல்... / Searching..." : "Searching Products...";
        setPageContext(pageCtx);

        const screenInstruction = language === 'ta-IN'
            ? "பொருட்களை தேட கீழே உள்ள மைக்ரோஃபோனை இரட்டை தட்டவும். நீங்கள் விரும்பும் பொருளின் பெயரை கூறவும்."
            : "Double-tap the bottom microphone and say what product you want to buy, like honey or turmeric.";
        setScreenInstruction(screenInstruction, false);

        const guide = language === 'ta-IN'
            ? "நீங்கள் வாங்க விரும்பும் பொருளின் பெயரைக் கூறுங்கள், அல்லது விருப்பம் தெரிவிக்க 'விருப்பம்' என்று சொல்லுங்கள்."
            : "Say the product name to search, or say 'Interested' to purchase.";
        setGuidePrompt(guide);

        return () => {
            setPageContext('');
        };
    }, [language, setPageContext, setScreenInstruction, setGuidePrompt]);

    // Polling mechanism to check if any pending order is accepted by seller
    useEffect(() => {
        const checkPendingStatuses = async () => {
            const orderIds = Object.values(pendingOrders).map(o => o.order_id);
            for (const orderId of orderIds) {
                try {
                    const statusRes = await getBuyerOrderDetails(orderId, language);
                    if (statusRes.status === 'invitation_accepted') {
                        // Seller has accepted! Transition buyer to checkout screen!
                        clearInterval(pollingIntervalRef.current);
                        setCheckoutOrder(statusRes);
                        if (statusRes.voice_prompt) {
                            speak(statusRes.voice_prompt, language);
                        }
                        break;
                    }
                } catch (e) {
                    console.error("Order polling check failed", e);
                }
            }
        };

        if (Object.keys(pendingOrders).length > 0) {
            pollingIntervalRef.current = setInterval(checkPendingStatuses, 2500);
        }

        return () => {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        };
    }, [pendingOrders, language, speak]);

    const performSearch = async (queryText) => {
        if (unmounted.current || !queryText) return;

        try {
            setState(BUYER_STATES.SEARCHING);
            setSearchQuery(queryText);
            setStatusText(language === 'ta-IN' ? `"${queryText}" தேடுகிறது...` : `Searching for "${queryText}"...`);

            const searchRes = await searchBuyerListings(queryText, language);
            const foundItems = searchRes.results || [];
            setResults(foundItems);
            setState(BUYER_STATES.RESULTS);

            const foundCount = foundItems.length;
            if (foundCount > 0) {
                const successMsg = language === 'ta-IN' 
                    ? `${queryText} குறித்த ${foundCount} முடிவுகள் கிடைத்துள்ளன.` 
                    : `Found ${foundCount} results for ${queryText}.`;
                setStatusText(successMsg);
                speak(successMsg, language);
            } else {
                const failMsg = language === 'ta-IN' 
                    ? `மன்னிக்கவும், "${queryText}" கிடைக்கவில்லை.` 
                    : `Sorry, no matches found for "${queryText}".`;
                setStatusText(failMsg);
                speak(failMsg, language);
            }
        } catch (err) {
            console.error("Search Error", err);
            const errorMsg = language === 'ta-IN' ? "எனக்கு புரியவில்லை. மீண்டும் கூறவும்." : "I didn't catch that. Please repeat.";
            setStatusText(errorMsg);
            speak(errorMsg, language);
            setState(BUYER_STATES.IDLE);
        }
    };

    // Buyer Expresses Interest -> Creates order in SQLite with status 'interest_expressed'
    const handleExpressInterest = async (listingId) => {
        try {
            const orderRes = await expressBuyerInterest(user.user_id, listingId, language);
            
            setPendingOrders(prev => ({
                ...prev,
                [listingId]: orderRes
            }));

            if (orderRes.voice_prompt) {
                speak(orderRes.voice_prompt, language);
            }
        } catch (e) {
            console.error("Interest Error", e);
            alert("Could not register interest. Please try again.");
        }
    };

    // Register voice handler for searching, navigating, or expressing interest (Rule 3)
    useEffect(() => {
        const handleVoiceInput = (rawText) => {
            if (!rawText) return;
            const text = normalizeText(rawText);
            console.log("[Buyer View Voice Input]:", text);

            // 1. Navigation Home / Back: 'முகப்பு', 'Home', 'main', 'back', 'பின்'
            if (isHomeIntent(text)) {
                if (onBack) onBack();
                return;
            }

            // 2. Express Interest: 'ஆர்வமாக உள்ளேன்', 'வாங்குகிறேன்', 'ஆர்வமுள்ளது', 'interest', 'buy this', 'want'
            if (isExpressInterestIntent(text)) {
                if (results.length > 0) {
                    handleExpressInterest(results[0].id);
                } else {
                    const needSearchMsg = language === 'ta-IN' 
                        ? "முதலில் ஒரு பொருளைத் தேடுங்கள்." 
                        : "Please search for a product first.";
                    speak(needSearchMsg, language);
                }
                return;
            }

            // 3. Search / Find: 'தேடு', 'வாங்கு', 'பொருள்', 'search', 'buy', 'find', 'மஞ்சள்', 'தேன்', 'turmeric', 'honey'
            if (text.length >= 2) {
                let cleanQuery = text
                    .replace(/^(search|find|buy|தேடு|வாங்கு|எனக்கு|வேண்டும்|காட்டு|பொருள்)\s+/i, '')
                    .trim();
                performSearch(cleanQuery || text);
            }
        };

        registerVoiceHandler(handleVoiceInput);

        return () => {
            unregisterVoiceHandler();
        };
    }, [language, results, onBack, registerVoiceHandler, unregisterVoiceHandler, speak]);

    useEffect(() => {
        return () => {
            unmounted.current = true;
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        };
    }, []);

    // ─── IF TRANSITIONED TO STEP 3: CHECKOUT ───
    if (checkoutOrder) {
        return (
            <BuyerCheckout
                order={checkoutOrder}
                user={user}
                language={language}
                onComplete={() => {
                    setCheckoutOrder(null);
                    setPendingOrders({});
                    setState(BUYER_STATES.IDLE);
                }}
                onBack={() => setCheckoutOrder(null)}
            />
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center p-8 pb-36">
            {/* Header Navigation */}
            <div className="w-full flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black text-white">
                        {language === 'ta-IN' ? "பொருட்களை தேடுங்கள்" : "Search for Products"}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {language === 'ta-IN' 
                            ? "இயற்கை தேன், மஞ்சள், மசாலா பொருட்களை நேரடியாக வாங்கலாம்" 
                            : "Direct from tribal producers - honey, turmeric, herbs & spices"}
                    </p>
                </div>
                {onBack && (
                    <button
                        onClick={onBack}
                        className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-300 font-bold rounded-xl text-sm transition-colors border border-slate-700"
                    >
                        ← {language === 'ta-IN' ? "முகப்பு" : "Dashboard"}
                    </button>
                )}
            </div>

            {/* Clean Query / Status Banner (No local mic buttons, no middle mic orb animations) */}
            <div className="w-full bg-[#0B152B]/90 border border-cyan-500/30 rounded-2xl p-6 mb-8 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-2xl flex-shrink-0">
                        🔍
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wider font-bold text-cyan-400">
                            {language === 'ta-IN' ? "தேடல் தகவல்" : "Voice Query Status"}
                        </p>
                        <p className="text-white font-bold text-base md:text-lg">
                            {statusText || (searchQuery ? `"${searchQuery}"` : (language === 'ta-IN' ? "கீழே உள்ள மைக்கில் 'தேன்' அல்லது 'மஞ்சள்' என்று பேசவும்" : "Double-tap bottom mic & say 'Honey' or 'Turmeric'"))}
                        </p>
                    </div>
                </div>

                {/* Quick Keyword Suggestion Pills */}
                <div className="flex flex-wrap gap-2 items-center justify-end w-full sm:w-auto">
                    {['தேன்', 'மஞ்சள்', 'Honey', 'Turmeric'].map((kw) => (
                        <button
                            key={kw}
                            onClick={() => performSearch(kw)}
                            className="px-3 py-1.5 bg-slate-800/80 hover:bg-cyan-900/50 hover:border-cyan-400 text-cyan-200 border border-slate-700 rounded-lg text-xs font-semibold transition-all"
                        >
                            {kw}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results Grid */}
            {state === BUYER_STATES.RESULTS && (
                <div className="w-full">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <span>📦</span>
                            <span>{language === 'ta-IN' ? `முடிவுகள் (${results.length})` : `Results (${results.length})`}</span>
                        </h2>
                        <button 
                            onClick={() => {
                                setState(BUYER_STATES.IDLE);
                                setSearchQuery('');
                                setStatusText('');
                            }}
                            className="px-4 py-2 bg-slate-800 text-cyan-300 rounded-xl hover:bg-slate-700 font-bold text-xs border border-slate-700"
                        >
                            {language === 'ta-IN' ? "தேடலை மீட்டமை" : "Clear Search"}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {results.map((item) => {
                            const isPending = !!pendingOrders[item.id];
                            return (
                                <div key={item.id} className="bg-[#0B152B]/90 rounded-3xl p-6 border border-slate-700/80 shadow-2xl flex flex-col h-full hover:border-cyan-500/50 transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-2xl font-black text-amber-400">{item.title}</h3>
                                        <span className="bg-emerald-950/80 text-emerald-400 px-3 py-1 rounded-full text-sm font-extrabold border border-emerald-700">
                                            ₹{item.price_per_unit} / {item.unit}
                                        </span>
                                    </div>
                                    
                                    <p className="text-gray-300 mb-6 flex-grow text-sm leading-relaxed">{item.description}</p>
                                    
                                    <div className="bg-[#060D1E] p-4 rounded-2xl mb-6 border border-slate-800">
                                        <p className="text-gray-400 text-xs mb-1">{language === 'ta-IN' ? "விற்பனையாளர்" : "Seller"}</p>
                                        <p className="text-white font-bold">{item.seller_name}</p>
                                        <p className="text-gray-400 text-xs">📍 {item.seller_village}</p>
                                        <p className="text-cyan-400 font-bold mt-2">📦 {item.quantity} {item.unit} {language === 'ta-IN' ? "இருப்பு உள்ளது" : "Available"}</p>
                                    </div>

                                    {/* Action button */}
                                    <div className="flex flex-col gap-3 w-full mt-2">
                                        {isPending ? (
                                            <div className="w-full py-3.5 bg-amber-950/70 border border-amber-500/60 rounded-xl text-amber-300 font-bold text-sm text-center flex items-center justify-center gap-2 animate-pulse">
                                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                                                <span>{language === 'ta-IN' ? "விற்பனையாளர் ஒப்புதலுக்காக காத்திருக்கிறது..." : "Waiting for seller acceptance..."}</span>
                                            </div>
                                        ) : (
                                            <div className="flex gap-3 w-full">
                                                <button 
                                                    onClick={() => handleExpressInterest(item.id)}
                                                    className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-black text-sm text-center shadow-lg transition-all"
                                                >
                                                    ✅ {language === 'ta-IN' ? "விருப்பம் தெரிவியுங்கள்" : "I'm Interested"}
                                                </button>
                                                <a 
                                                    href={`tel:${item.seller_phone}`}
                                                    className="px-4 py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm text-center transition-colors flex items-center justify-center"
                                                >
                                                    📞
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};


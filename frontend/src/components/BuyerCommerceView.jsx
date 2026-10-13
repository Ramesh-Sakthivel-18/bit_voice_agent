import React, { useState, useEffect, useRef } from 'react';
import { 
    searchBuyerListings, 
    getAllBuyerListings, 
    createDirectOrder, 
    getBuyerOrderDetails 
} from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { BuyerCheckout } from './BuyerCheckout';
import { BuyerOrderHistory } from './BuyerOrderHistory';
import { getTranslation, translateField } from '../utils/translations';
import { 
    isBuyNowIntent, 
    isHomeIntent, 
    isSearchIntent, 
    isOrderHistoryIntent,
    normalizeText,
    matchesAnyKeyword,
    BUYER_SEARCH_KEYWORDS,
    GLOBAL_HOME_KEYWORDS,
    isAffirmativeIntent,
    isNegativeIntent
} from '../utils/voiceMatcher';

export const BuyerCommerceView = ({ language, user, onBack }) => {
    // 1. Language determination: strictly adhere to language chosen at the first page
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

    // 2. State management
    const [allProducts, setAllProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [isSearchingServer, setIsSearchingServer] = useState(false);
    const [statusText, setStatusText] = useState('');
    
    // Quantity state map: listingId -> quantity
    const [quantities, setQuantities] = useState({});
    
    // View mode: 'catalog' | 'checkout' | 'history'
    const [checkoutOrder, setCheckoutOrder] = useState(null);
    const [showHistory, setShowHistory] = useState(false);

    // Step 4 Voice Confirmation Guardrail State: { item, qty, totalAmount, prompt }
    const [guardrailPurchase, setGuardrailPurchase] = useState(null);
    const [isActionProcessing, setIsActionProcessing] = useState(false);

    const unmounted = useRef(false);

    // 3. Load all active products from SQLite DB on mount & whenever language changes
    const fetchAllProducts = async () => {
        setIsLoading(true);
        try {
            const res = await getAllBuyerListings(activeLang);
            const items = res.results || [];
            if (!unmounted.current) {
                setAllProducts(items);
                setFilteredProducts(items);

                // Initialize default quantities of 1
                const initQty = {};
                items.forEach(it => { initQty[it.id] = 1; });
                setQuantities(initQty);

                const welcomeMsg = isTamil 
                    ? `தற்போது கடையில் ${items.length} பொருட்கள் உள்ளன.` 
                    : `${items.length} products are currently available in the catalog.`;
                setStatusText(welcomeMsg);
            }
        } catch (err) {
            console.error("Failed to fetch all listings", err);
            if (!unmounted.current) {
                setStatusText(isTamil ? "தயாரிப்புகளை ஏற்றுவதில் பிழை ஏற்பட்டது." : "Could not load products. Please retry.");
            }
        } finally {
            if (!unmounted.current) {
                setIsLoading(false);
            }
        }
    };

    useEffect(() => {
        fetchAllProducts();
    }, [activeLang]);

    // 4. Update Smart Voice context & screen instructions
    useEffect(() => {
        if (showHistory || checkoutOrder) return;

        let pageCtx = isTamil ? "பொருட்கள் பட்டியல் & வாங்குதல்" : "Product Catalog & Purchasing";
        if (guardrailPurchase) {
            pageCtx = isTamil ? "கொள்முதல் உறுதிப்படுத்தல்" : "Confirm Purchase";
        }
        setPageContext(pageCtx);

        const screenInstruction = guardrailPurchase
            ? (isTamil
                ? "வாங்க உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்."
                : "Say 'Yes' to confirm direct purchase or 'No' to cancel.")
            : (isTamil
                ? "பொருட்களைத் தேர்ந்தெடுக்கவும், அளவை மாற்றவும், 'இப்போதே வாங்கு' பொத்தானை தட்டவும்."
                : "Browse products, select your quantity, and tap Buy Now to purchase directly.");
        setScreenInstruction(screenInstruction, !!guardrailPurchase);

        const guide = guardrailPurchase
            ? (isTamil ? "உறுதிப்படுத்த 'ஆம்', ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்." : "Say 'Yes' to confirm, 'No' to cancel.")
            : (isTamil
                ? "பொருளை வாங்க 'வாங்கு' என்று சொல்லுங்கள், அல்லது அளவைக் கூறி ஆர்டர் செய்யுங்கள்."
                : "Say 'Buy' or select quantity and tap Buy Now to purchase.");
        setGuidePrompt(guide);

        return () => {
            setPageContext('');
        };
    }, [activeLang, isTamil, guardrailPurchase, showHistory, checkoutOrder, setPageContext, setScreenInstruction, setGuidePrompt]);

    // 5. Quantity Stepper Handler
    const handleQuantityChange = (itemId, newQty, maxStock = 100) => {
        const val = Math.max(1, Math.min(Number(newQty) || 1, maxStock || 100));
        setQuantities(prev => ({
            ...prev,
            [itemId]: val
        }));
    };

    // 6. Fast Client-Side Instant Filtering (Typing & Category Pills)
    const applyFilter = (queryText, categoryKey, sourceList = allProducts) => {
        let list = [...sourceList];

        // A. Filter by Category
        if (categoryKey && categoryKey !== 'all') {
            const cat = categoryKey.toLowerCase();
            list = list.filter(item => {
                const combined = `${item.title || ''} ${item.description || ''} ${item.search_tags || ''}`.toLowerCase();
                if (cat === 'honey' || cat === 'தேன்') {
                    return combined.includes('honey') || combined.includes('தேன்') || combined.includes('தேனீ');
                }
                if (cat === 'turmeric' || cat === 'மஞ்சள்') {
                    return combined.includes('turmeric') || combined.includes('மஞ்சள்') || combined.includes('manjal') || combined.includes('haldi');
                }
                if (cat === 'spices' || cat === 'மசாலா') {
                    return combined.includes('spice') || combined.includes('மசாலா') || combined.includes('மிளகு') || combined.includes('pepper') || combined.includes('cardamom');
                }
                return combined.includes(cat);
            });
        }

        // B. Filter by Typed Query
        if (queryText && queryText.trim()) {
            const q = queryText.trim().toLowerCase();
            const keywords = [q];
            if (q.includes('honey') || q.includes('தேன்')) {
                keywords.push('honey', 'தேன்', 'தேனீ');
            }
            if (q.includes('turmeric') || q.includes('மஞ்சள்') || q.includes('manjal')) {
                keywords.push('turmeric', 'மஞ்சள்', 'manjal', 'haldi');
            }

            list = list.filter(item => {
                const title = (item.title || '').toLowerCase();
                const desc = (item.description || '').toLowerCase();
                const tags = (item.search_tags || '').toLowerCase();
                const seller = (item.seller_name || '').toLowerCase();
                const village = (item.seller_village || '').toLowerCase();
                const unit = (item.unit || '').toLowerCase();
                const combined = `${title} ${desc} ${tags} ${seller} ${village} ${unit}`;

                return keywords.some(kw => combined.includes(kw));
            });
        }

        setFilteredProducts(list);
    };

    // Handle manual typing in search bar
    const handleSearchInputChange = (e) => {
        const val = e.target.value;
        setSearchQuery(val);
        applyFilter(val, activeCategory, allProducts);
        
        if (val.trim()) {
            setStatusText(isTamil ? `"${val}" என வடிகட்டப்படுகிறது...` : `Filtering for "${val}"...`);
        } else {
            setStatusText(isTamil ? `அனைத்து தயாரிப்புகளும் காட்டப்படுகின்றன (${allProducts.length}).` : `Showing all products (${allProducts.length}).`);
        }
    };

    // Handle clear search
    const handleClearSearch = () => {
        setSearchQuery('');
        setActiveCategory('all');
        setFilteredProducts(allProducts);
        const msg = isTamil ? `அனைத்து தயாரிப்புகளும் காட்டப்படுகின்றன (${allProducts.length}).` : `Showing all products (${allProducts.length}).`;
        setStatusText(msg);
        speak(msg, activeLang);
    };

    // Handle Category pill click
    const handleCategoryClick = (catKey) => {
        const newCat = activeCategory === catKey ? 'all' : catKey;
        setActiveCategory(newCat);
        applyFilter(searchQuery, newCat, allProducts);

        const catName = newCat === 'all' 
            ? (isTamil ? "அனைத்து பொருட்கள்" : "All Products") 
            : newCat;
        const msg = isTamil ? `${catName} தேர்ந்தெடுக்கப்பட்டது.` : `Filtered by ${catName}.`;
        setStatusText(msg);
    };

    // Deep Search via Backend API
    const performDeepSearch = async (queryText) => {
        if (!queryText || !queryText.trim()) {
            handleClearSearch();
            return;
        }

        try {
            setIsSearchingServer(true);
            setStatusText(isTamil ? `"${queryText}" தேடுகிறது...` : `Searching for "${queryText}"...`);

            const searchRes = await searchBuyerListings(queryText, activeLang);
            const foundItems = searchRes.results || [];
            
            if (foundItems.length > 0) {
                setFilteredProducts(foundItems);
                const successMsg = isTamil 
                    ? `"${queryText}" குறித்த ${foundItems.length} தயாரிப்புகள் கிடைத்துள்ளன.` 
                    : `Found ${foundItems.length} results for "${queryText}".`;
                setStatusText(successMsg);
                speak(successMsg, activeLang);
            } else {
                applyFilter(queryText, activeCategory, allProducts);
                const failMsg = isTamil 
                    ? `மன்னிக்கவும், "${queryText}" கிடைக்கவில்லை.` 
                    : `Sorry, no matches found for "${queryText}".`;
                setStatusText(failMsg);
                speak(failMsg, activeLang);
            }
        } catch (err) {
            console.error("Deep Search Error", err);
            applyFilter(queryText, activeCategory, allProducts);
        } finally {
            setIsSearchingServer(false);
        }
    };

    // ─── BUY NOW FLOW: INITIATE DIRECT ORDER ───
    const initiateBuyNow = (item, selectedQty = 1) => {
        const qty = selectedQty || quantities[item.id] || 1;
        const totalAmount = roundPrice(qty * (item.price_per_unit || 0));

        const prompt = isTamil
            ? `நான் ${translateField(item.seller_name, activeLang)}-ன் ${translateField(item.title, activeLang)} பொருளுக்கான ${qty} ${translateField(item.unit, activeLang)} ஆர்டரை வைக்க உள்ளேன் (மதிப்பு ₹${totalAmount}). உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்.`
            : `I am about to buy ${qty} ${item.unit} of ${item.title} from ${item.seller_name} for ₹${totalAmount}. Say 'Yes' to confirm or 'No' to cancel.`;

        setGuardrailPurchase({
            item,
            qty,
            totalAmount,
            prompt
        });
        speak(prompt, activeLang);
    };

    // ─── COMMIT DIRECT ORDER TO SQLITE & TRANSITION TO CHECKOUT ───
    const commitBuyNow = async () => {
        if (!guardrailPurchase) return;
        const { item, qty } = guardrailPurchase;

        setIsActionProcessing(true);
        try {
            const orderRes = await createDirectOrder(user.user_id, item.id, qty, activeLang);
            setGuardrailPurchase(null);

            // Transition directly to Checkout / Payment screen!
            setCheckoutOrder(orderRes);

            if (orderRes.voice_prompt) {
                speak(orderRes.voice_prompt, activeLang);
            }
        } catch (err) {
            console.error("Direct Order creation failed:", err);
            alert(isTamil ? "ஆர்டர் உருவாக்குவதில் பிழை ஏற்பட்டது." : "Could not create order. Please try again.");
        } finally {
            setIsActionProcessing(false);
        }
    };

    const cancelGuardrail = () => {
        setGuardrailPurchase(null);
        const cancelMsg = isTamil ? "செயல் ரத்து செய்யப்பட்டது." : "Action cancelled.";
        speak(cancelMsg, activeLang);
    };

    const roundPrice = (val) => Math.round((Number(val) || 0) * 100) / 100;

    // 7. Register Voice Handler
    useEffect(() => {
        if (showHistory || checkoutOrder) return;

        const handleVoiceInput = (rawText) => {
            if (!rawText) return;
            const text = normalizeText(rawText);
            console.log("[Buyer View Voice Input]:", text);

            // A. Guardrail confirmation check
            if (guardrailPurchase) {
                if (isAffirmativeIntent(text)) {
                    commitBuyNow();
                    return;
                }
                if (isNegativeIntent(text)) {
                    cancelGuardrail();
                    return;
                }
                speak(isTamil ? "உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்." : "Say 'Yes' to confirm or 'No' to cancel.", activeLang);
                return;
            }

            // B. Navigation Home
            if (isHomeIntent(text)) {
                if (onBack) onBack();
                return;
            }

            // C. Navigation to Order History
            if (isOrderHistoryIntent(text)) {
                setShowHistory(true);
                return;
            }

            // D. Show All
            if (text.includes('all') || text.includes('அனைத்தும்') || text.includes('எல்லாம்') || text.includes('clear')) {
                handleClearSearch();
                return;
            }

            // E. Direct Buy Now Voice Trigger ("buy now", "வாங்கு 2 கிலோ", etc.)
            if (isBuyNowIntent(text)) {
                const targetList = filteredProducts.length > 0 ? filteredProducts : allProducts;
                if (targetList.length > 0) {
                    const firstItem = targetList[0];
                    // Extract any explicit digit from utterance (e.g. "buy 2 kg")
                    const matchQty = text.match(/\b(\d+)\b/);
                    const parsedQty = matchQty ? parseInt(matchQty[1], 10) : (quantities[firstItem.id] || 1);
                    
                    if (matchQty) {
                        handleQuantityChange(firstItem.id, parsedQty, firstItem.quantity);
                    }
                    initiateBuyNow(firstItem, parsedQty);
                } else {
                    const msg = isTamil ? "பொருட்கள் எதுவும் கிடைக்கவில்லை." : "No products available to buy.";
                    speak(msg, activeLang);
                }
                return;
            }

            // F. Product Filter / Search via Voice
            if (text.length >= 2) {
                let cleanQuery = text
                    .replace(/^(search|find|filter|show|தேடு|காட்டு|பொருள்)\s+/i, '')
                    .trim();
                
                const queryToUse = cleanQuery || text;
                setSearchQuery(queryToUse);
                applyFilter(queryToUse, activeCategory, allProducts);
                performDeepSearch(queryToUse);
            }
        };

        registerVoiceHandler(handleVoiceInput);

        return () => {
            unregisterVoiceHandler();
        };
    }, [activeLang, isTamil, filteredProducts, allProducts, activeCategory, guardrailPurchase, quantities, showHistory, checkoutOrder, onBack, registerVoiceHandler, unregisterVoiceHandler, speak]);

    useEffect(() => {
        return () => {
            unmounted.current = true;
        };
    }, []);

    // ─── TRANSITION TO VIEW: DEDICATED ORDER HISTORY ───
    if (showHistory) {
        return (
            <BuyerOrderHistory
                language={activeLang}
                user={user}
                onBack={() => setShowHistory(false)}
            />
        );
    }

    // ─── TRANSITION TO VIEW: DIRECT CHECKOUT ───
    if (checkoutOrder) {
        return (
            <BuyerCheckout
                order={checkoutOrder}
                user={user}
                language={activeLang}
                onComplete={() => {
                    setCheckoutOrder(null);
                    setShowHistory(true); // Guide buyer directly to tracking / history
                }}
                onBack={() => setCheckoutOrder(null)}
            />
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center p-4 md:p-8 pb-40">
            {/* Header Navigation */}
            <div className="w-full flex justify-between items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                        {isTamil ? "பொருட்கள் பட்டியல் & வாங்குதல்" : "Product Catalog & Purchasing"}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {isTamil 
                            ? "பழங்குடியின விவசாயிகளிடமிருந்து நேரடியாக வாங்கவும் - அளவை தேர்வு செய்து இப்போதே ஆர்டர் செய்யவும்" 
                            : "Direct e-commerce purchase from tribal producers - select quantity & buy now"}
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Dedicated Order History button */}
                    <button
                        onClick={() => setShowHistory(true)}
                        className="px-4 py-2.5 bg-gradient-to-r from-purple-900/80 to-indigo-900/80 hover:from-purple-800 hover:to-indigo-800 text-purple-200 border border-purple-500/50 font-bold rounded-xl text-xs md:text-sm transition-all shadow-md flex items-center gap-2 flex-shrink-0 cursor-pointer"
                    >
                        <span>📜</span>
                        <span>{isTamil ? "ஆர்டர் வரலாறு" : "My Orders"}</span>
                    </button>

                    {onBack && (
                        <button
                            onClick={onBack}
                            className="px-4 py-2.5 bg-slate-800/90 hover:bg-slate-700 text-gray-200 font-bold rounded-xl text-xs md:text-sm transition-all border border-slate-700 shadow-md flex items-center gap-2 flex-shrink-0 cursor-pointer"
                        >
                            <span>←</span>
                            <span>{isTamil ? "முகப்பு" : "Dashboard"}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ─── TYPING SEARCH BAR & FILTER SECTION ─── */}
            <div className="w-full bg-gradient-to-b from-[#0F1E3A]/95 to-[#081226]/95 border border-cyan-500/40 rounded-3xl p-6 mb-8 shadow-2xl backdrop-blur-xl">
                {/* Search Input Bar with Icon, Input, and Action Buttons */}
                <div className="relative flex items-center w-full mb-4">
                    <div className="absolute left-4 text-cyan-400 text-xl pointer-events-none">
                        🔍
                    </div>

                    <input
                        type="text"
                        value={searchQuery}
                        onChange={handleSearchInputChange}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                performDeepSearch(searchQuery);
                            }
                        }}
                        placeholder={
                            isTamil 
                                ? "பொருளின் பெயர் அல்லது ஊரை தட்டச்சு செய்து தேடவும் (எ.கா: தேன், மஞ்சள்)..." 
                                : "Type produce name, village, or keyword (e.g., Honey, Turmeric)..."
                        }
                        className="w-full pl-12 pr-28 py-4 bg-[#050B17] border border-cyan-500/50 rounded-2xl text-white placeholder-gray-400 text-base md:text-lg focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30 transition-all shadow-inner"
                    />

                    {/* Right side inside input: Clear button and Search button */}
                    <div className="absolute right-3 flex items-center gap-2">
                        {searchQuery && (
                            <button
                                onClick={handleClearSearch}
                                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-gray-300 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                                title={isTamil ? "அழி" : "Clear"}
                            >
                                ✕
                            </button>
                        )}
                        <button
                            onClick={() => performDeepSearch(searchQuery)}
                            disabled={isSearchingServer}
                            className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs md:text-sm font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                            {isSearchingServer 
                                ? "..." 
                                : (isTamil ? "தேடு" : "Search")}
                        </button>
                    </div>
                </div>

                {/* Category Filter Pills & Mode Hints */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                    <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs text-gray-400 font-semibold mr-1">
                            {isTamil ? "வடிகட்டி:" : "Filter:"}
                        </span>

                        <button
                            onClick={() => handleCategoryClick('all')}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                                activeCategory === 'all' && !searchQuery
                                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                                    : 'bg-slate-800/90 text-gray-300 border-slate-700 hover:border-cyan-500/50'
                            }`}
                        >
                            🏷️ {isTamil ? "அனைத்தும்" : "All"} ({allProducts.length})
                        </button>

                        <button
                            onClick={() => handleCategoryClick('honey')}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                                activeCategory === 'honey'
                                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                                    : 'bg-slate-800/90 text-amber-200 border-slate-700 hover:border-amber-500/50'
                            }`}
                        >
                            🍯 {isTamil ? "தேன்" : "Honey"}
                        </button>

                        <button
                            onClick={() => handleCategoryClick('turmeric')}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                                activeCategory === 'turmeric'
                                    ? 'bg-yellow-500 text-slate-950 border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.4)]'
                                    : 'bg-slate-800/90 text-yellow-200 border-slate-700 hover:border-yellow-500/50'
                            }`}
                        >
                            🌿 {isTamil ? "மஞ்சள்" : "Turmeric"}
                        </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-cyan-300/90 bg-cyan-950/40 border border-cyan-800/50 px-3 py-1.5 rounded-xl">
                        <span>🎙️ 🛒</span>
                        <span>
                            {isTamil ? "அளவைத் தேர்வு செய்து 'இப்போதே வாங்கு' பொத்தானை தட்டவும்" : "Select quantity & tap Buy Now"}
                        </span>
                    </div>
                </div>

                {/* Status Bar */}
                {statusText && (
                    <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-cyan-200">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                            <span>{statusText}</span>
                        </div>
                        {(searchQuery || activeCategory !== 'all') && (
                            <button
                                onClick={handleClearSearch}
                                className="text-cyan-400 hover:text-cyan-300 underline font-semibold ml-2 cursor-pointer"
                            >
                                {isTamil ? "தேடலை மீட்டமை" : "Reset Filter"}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ─── PRODUCT CATALOG & RESULTS GRID ─── */}
            <div className="w-full">
                {/* Catalog Title & Count Bar */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <span>📦</span>
                        <span>
                            {isTamil 
                                ? `தயாரிப்புகள் (${filteredProducts.length} / ${allProducts.length})` 
                                : `Products (${filteredProducts.length} of ${allProducts.length})`}
                        </span>
                    </h2>

                    {(searchQuery || activeCategory !== 'all') && (
                        <button 
                            onClick={handleClearSearch}
                            className="px-4 py-2 bg-slate-800 text-cyan-300 rounded-xl hover:bg-slate-700 font-bold text-xs border border-slate-700 transition-colors shadow-sm cursor-pointer"
                        >
                            {isTamil ? "அனைத்தையும் காட்டு" : "Show All Products"}
                        </button>
                    )}
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="w-full py-20 flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-cyan-300 font-bold text-lg">
                            {isTamil ? "பொருட்கள் ஏற்றப்படுகின்றன..." : "Loading products from database..."}
                        </p>
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && filteredProducts.length === 0 && (
                    <div className="w-full bg-[#0B152B]/80 border border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center shadow-xl">
                        <div className="text-5xl mb-4">🔍</div>
                        <h3 className="text-xl font-bold text-white mb-2">
                            {isTamil ? "பொருட்கள் எதுவும் கிடைக்கவில்லை" : "No Matching Products Found"}
                        </h3>
                        <p className="text-gray-400 text-sm max-w-md mb-6">
                            {searchQuery 
                                ? (isTamil 
                                    ? `"${searchQuery}" என்ற தேடலுக்கு தயாரிப்புகள் இல்லை. வேறு வார்த்தையை முயற்சிக்கவும்.` 
                                    : `No listings match "${searchQuery}". Try a different keyword.`)
                                : (isTamil 
                                    ? "தற்போது இந்த வகையில் தயாரிப்புகள் எதுவும் இல்லை." 
                                    : "No products available in this category.")}
                        </p>
                        <button
                            onClick={handleClearSearch}
                            className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl text-sm shadow-lg transition-all cursor-pointer"
                        >
                            {isTamil ? "அனைத்து பொருட்களையும் காட்டு" : "Show All Products"}
                        </button>
                    </div>
                )}

                {/* Products Grid */}
                {!isLoading && filteredProducts.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProducts.map((item) => {
                            const curQty = quantities[item.id] || 1;
                            const totalPrice = roundPrice(curQty * (item.price_per_unit || 0));

                            return (
                                <div 
                                    key={item.id} 
                                    className="bg-[#0B152B]/95 rounded-3xl p-6 border border-slate-700/80 shadow-2xl flex flex-col h-full hover:border-cyan-500/60 transition-all duration-200 hover:-translate-y-1"
                                >
                                    {/* Card Header: Title & Unit Price */}
                                    <div className="flex justify-between items-start mb-3 gap-2">
                                        <h3 className="text-2xl font-black text-amber-400 leading-snug">
                                            {translateField(item.title, activeLang)}
                                        </h3>
                                        <span className="bg-emerald-950/80 text-emerald-400 px-3 py-1.5 rounded-full text-sm font-extrabold border border-emerald-700 flex-shrink-0 shadow-sm">
                                            ₹{item.price_per_unit} / {translateField(item.unit, activeLang)}
                                        </span>
                                    </div>
                                    
                                    {/* Description */}
                                    <p className="text-gray-300 mb-5 flex-grow text-sm leading-relaxed">
                                        {translateField(item.description, activeLang)}
                                    </p>
                                    
                                    {/* Producer Card */}
                                    <div className="bg-[#060D1E] p-4 rounded-2xl mb-5 border border-slate-800">
                                        <div className="flex justify-between items-center text-xs text-gray-400 mb-1">
                                            <span>{isTamil ? "விற்பனையாளர்" : "Seller"}</span>
                                            <span className="text-cyan-400 font-bold">
                                                📦 {item.quantity} {translateField(item.unit, activeLang)} {isTamil ? "இருப்பு" : "in stock"}
                                            </span>
                                        </div>
                                        <p className="text-white font-bold text-base">
                                            {translateField(item.seller_name, activeLang)}
                                        </p>
                                        <p className="text-gray-400 text-xs mt-0.5">
                                            📍 {translateField(item.seller_village, activeLang)}
                                        </p>
                                    </div>

                                    {/* ─── E-COMMERCE QUANTITY SELECTOR (VOICE OR TYPING) ─── */}
                                    <div className="bg-[#08152B] p-4 rounded-2xl border border-cyan-500/30 mb-5 flex flex-col gap-2">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-300 font-bold uppercase tracking-wider">
                                                {isTamil ? "அளவைத் தேர்வு செய்:" : "Select Quantity:"}
                                            </span>
                                            <span className="text-gray-400 text-xs">
                                                (Max: {item.quantity} {translateField(item.unit, activeLang)})
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between gap-3 mt-1">
                                            {/* Decrement Button */}
                                            <button
                                                type="button"
                                                onClick={() => handleQuantityChange(item.id, curQty - 1, item.quantity)}
                                                className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-black text-xl flex items-center justify-center transition-all border border-slate-700 cursor-pointer active:scale-95"
                                            >
                                                -
                                            </button>

                                            {/* Quantity Input Field (Type or Voice) */}
                                            <div className="flex-1 flex items-center justify-center gap-1.5 bg-[#030814] border border-cyan-500/40 rounded-xl py-2 px-3">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max={item.quantity || 100}
                                                    value={curQty}
                                                    onChange={(e) => handleQuantityChange(item.id, e.target.value, item.quantity)}
                                                    className="w-16 bg-transparent text-center font-black text-lg text-white focus:outline-none"
                                                />
                                                <span className="text-gray-400 font-bold text-sm">
                                                    {translateField(item.unit, activeLang)}
                                                </span>
                                            </div>

                                            {/* Increment Button */}
                                            <button
                                                type="button"
                                                onClick={() => handleQuantityChange(item.id, curQty + 1, item.quantity)}
                                                className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-black text-xl flex items-center justify-center transition-all border border-slate-700 cursor-pointer active:scale-95"
                                            >
                                                +
                                            </button>
                                        </div>

                                        {/* Dynamic Total Price Calculation */}
                                        <div className="flex justify-between items-center pt-2 border-t border-slate-800/80 mt-1">
                                            <span className="text-xs text-gray-400 font-bold">
                                                {isTamil ? "மொத்த விலை:" : "Calculated Total:"}
                                            </span>
                                            <span className="text-base font-black text-amber-400">
                                                ₹{totalPrice.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>

                                    {/* ─── E-COMMERCE BUY NOW BUTTON (REPLACED INTEREST BUTTON) ─── */}
                                    <div className="flex gap-3 w-full mt-auto">
                                        <button 
                                            onClick={() => initiateBuyNow(item, curQty)}
                                            className="flex-1 py-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white rounded-2xl font-black text-base text-center shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                                        >
                                            <span>🛒</span>
                                            <span>{isTamil ? "இப்போதே வாங்கு" : "Buy Now"} (₹{totalPrice.toLocaleString()})</span>
                                        </button>
                                        
                                        {item.seller_phone && (
                                            <a 
                                                href={`tel:${item.seller_phone}`}
                                                className="px-4 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold text-sm text-center transition-colors flex items-center justify-center border border-slate-700"
                                                title={isTamil ? "விற்பனையாளரை அழைக்க" : "Call Producer"}
                                            >
                                                📞
                                            </a>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ─── STEP 4: BUY NOW CONFIRMATION GUARDRAIL MODAL ─── */}
            {guardrailPurchase && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-[#0B152B] border-2 border-emerald-400 rounded-3xl p-6 md:p-8 max-w-lg w-full text-center shadow-[0_0_50px_rgba(16,185,129,0.6)] animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 rounded-full bg-emerald-400/20 border-2 border-emerald-400 text-emerald-400 text-3xl flex items-center justify-center mx-auto mb-4">
                            🛒
                        </div>

                        <h3 className="text-2xl font-black text-white mb-2">
                            {isTamil ? "கொள்முதல் உறுதிப்படுத்தல்" : "Purchase Confirmation"}
                        </h3>

                        <div className="bg-[#070F1E] border border-slate-700 rounded-2xl p-4 my-4 text-left space-y-1.5">
                            <p className="text-white font-bold text-base">
                                📦 {translateField(guardrailPurchase.item?.title, activeLang)}
                            </p>
                            <p className="text-gray-300 text-sm">
                                👨‍🌾 {translateField(guardrailPurchase.item?.seller_name, activeLang)} ({translateField(guardrailPurchase.item?.seller_village, activeLang)})
                            </p>
                            <p className="text-cyan-300 font-bold text-sm">
                                {isTamil ? "அளவு" : "Quantity"}: {guardrailPurchase.qty} {translateField(guardrailPurchase.item?.unit, activeLang)} @ ₹{guardrailPurchase.item?.price_per_unit}/{translateField(guardrailPurchase.item?.unit, activeLang)}
                            </p>
                            <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                                <span className="text-gray-400 text-xs font-bold uppercase">{isTamil ? "மொத்த தொகை" : "Total Amount"}</span>
                                <span className="text-amber-400 font-black text-2xl">₹{guardrailPurchase.totalAmount}</span>
                            </div>
                        </div>

                        <p className="text-cyan-200 font-bold text-sm md:text-base mb-6 leading-relaxed">
                            {guardrailPurchase.prompt}
                            <br />
                            <span className="text-amber-300 text-xs mt-1 block">
                                🎙️ {isTamil ? "உறுதி செய்ய 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்" : "Say 'Yes' to confirm or 'No' to cancel into mic"}
                            </span>
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={commitBuyNow}
                                disabled={isActionProcessing}
                                className="py-3.5 px-6 rounded-xl font-black text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                <span>✅</span>
                                <span>{isTamil ? "ஆம் (வாங்கு)" : "Yes (Buy Now)"}</span>
                            </button>

                            <button
                                type="button"
                                onClick={cancelGuardrail}
                                disabled={isActionProcessing}
                                className="py-3.5 px-6 rounded-xl font-bold text-gray-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                <span>❌</span>
                                <span>{isTamil ? "இல்லை (ரத்து)" : "No (Cancel)"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

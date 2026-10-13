import React, { useState, useEffect, useRef } from 'react';
import { validateCommerceStep, saveSellerListing } from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { getTranslation, translateField } from '../utils/translations';
import { 
    isHomeIntent, 
    isMyProductsIntent, 
    matchesAnyKeyword,
    normalizeText,
    isAffirmativeIntent,
    isNegativeIntent
} from '../utils/voiceMatcher';

const SELLER_STATES = {
    PRODUCT: 0,
    QUANTITY: 1,
    PRICE: 2,
    CONFIRM_1: 3,
    PUBLISHED: 4
};

const QUICK_COMMODITIES = [
    { title: "Wild Forest Honey", local: "காட்டுத் தேன்", unit: "kg", defaultPrice: 450 },
    { title: "Organic Turmeric", local: "இயற்கை மஞ்சள்", unit: "kg", defaultPrice: 120 },
    { title: "Black Pepper", local: "கருப்பு மிளகு", unit: "kg", defaultPrice: 600 },
    { title: "Cardamom", local: "ஏலக்காய்", unit: "kg", defaultPrice: 1500 },
    { title: "Ginger", local: "இஞ்சி", unit: "kg", defaultPrice: 80 },
    { title: "Coffee Beans", local: "காப்பி விதைகள்", unit: "kg", defaultPrice: 320 }
];

export const SellerCommerceView = ({ language, user, onBack, onViewListings }) => {
    const { 
        setPageContext,
        setScreenInstruction, 
        setGuidePrompt, 
        speak, 
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();

    const t = getTranslation(language);

    // Mode: 'voice' | 'manual'
    const [inputMode, setInputMode] = useState('voice');
    const [step, setStep] = useState(SELLER_STATES.PRODUCT);
    const [statusFeedback, setStatusFeedback] = useState('');
    const [listingData, setListingData] = useState({ 
        title: '', 
        quantity: '', 
        unit: 'kg', 
        price_per_unit: '' 
    });
    const [guardrailModal, setGuardrailModal] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    
    const unmounted = useRef(false);
    const listingDataRef = useRef(listingData);

    useEffect(() => {
        listingDataRef.current = listingData;
    }, [listingData]);

    const prompts = {
        product: language === 'ta-IN' ? "நீங்கள் என்ன பொருள் விற்க விரும்புகிறீர்கள்? சொல்லுங்கள்." : "What produce do you want to sell? Please speak.",
        quantity: language === 'ta-IN' ? "உங்களிடம் எத்தனை கிலோ அல்லது எவ்வளவு அளவு உள்ளது?" : "What is the quantity available?",
        price: language === 'ta-IN' ? "ஒரு கிலோவுக்கு நீங்கள் என்ன விலை எதிர்பார்க்கிறீர்கள்? ரூபாயில் சொல்லுங்கள்." : "What is your expected price in rupees per unit?"
    };

    // Calculate total
    const totalAmount = (Number(listingData.quantity) || 0) * (Number(listingData.price_per_unit) || 0);

    // Dynamic context updates for Smart Voice Dock
    useEffect(() => {
        let stepContextBadge = "";
        let promptText = "";

        const isAllFilled = Boolean(listingData.title && listingData.quantity && listingData.price_per_unit);

        if (guardrailModal) {
            stepContextBadge = language === 'ta-IN' ? "உறுதிப்படுத்தல் / Confirm Action" : "Confirm Action";
            promptText = language === 'ta-IN' 
                ? `இந்த விற்பனையை உறுதி செய்ய 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்.` 
                : `Say 'Yes' to confirm publishing or 'No' to cancel.`;
        } else if (inputMode === 'manual') {
            stepContextBadge = language === 'ta-IN' ? "தட்டச்சு பதிவு / Manual Input" : "Manual Listing";
            promptText = language === 'ta-IN' 
                ? "விவரங்களை தட்டச்சு செய்து 'விற்பனைக்கு வெளியிடு' அழுத்தவும்." 
                : "Enter product details and tap 'Publish Listing'.";
        } else if (isAllFilled) {
            stepContextBadge = language === 'ta-IN' ? "தானாக சேமிக்கப்படுகிறது / Auto-saving" : "Auto-saving";
            promptText = language === 'ta-IN'
                ? "அனைத்து விவரங்களும் பெறப்பட்டன! விற்பனை தானாகவே சேமிக்கப்படுகிறது."
                : "All details filled! Listing is being saved automatically.";
        } else if (step === SELLER_STATES.PRODUCT) {
            stepContextBadge = language === 'ta-IN' ? "1/3: பொருளின் பெயர் / Produce Name" : "1/3: Produce Name";
            promptText = prompts.product;
        } else if (step === SELLER_STATES.QUANTITY) {
            stepContextBadge = language === 'ta-IN' ? "2/3: அளவு / Quantity" : "2/3: Quantity";
            promptText = prompts.quantity;
        } else if (step === SELLER_STATES.PRICE) {
            stepContextBadge = language === 'ta-IN' ? "3/3: விலை / Price" : "3/3: Price";
            promptText = prompts.price;
        } else if (step === SELLER_STATES.CONFIRM_1) {
            stepContextBadge = language === 'ta-IN' ? "தானாக சேமிக்கப்படுகிறது / Auto-saving" : "Auto-saving";
            promptText = language === 'ta-IN'
                ? `அனைத்து விவரங்களும் பெறப்பட்டன! விற்பனை தானாகவே சேமிக்கப்படுகிறது.`
                : `All details received! Auto-saving listing to SQLite...`;
        } else if (step === SELLER_STATES.PUBLISHED) {
            stepContextBadge = language === 'ta-IN' ? "வெளியிடப்பட்டது / Published" : "Published";
            promptText = language === 'ta-IN' ? "வெற்றிகரமாக வெளியிடப்பட்டது!" : "Successfully published!";
        }

        setPageContext(stepContextBadge);
        setScreenInstruction(promptText, true);

        const guide = language === 'ta-IN'
            ? "பொருளின் விவரங்களைக் கூறுங்கள், அல்லது முகப்பிற்குச் செல்ல 'முகப்பு' என்று சொல்லுங்கள்."
            : "Speak details, or say 'Home' to return to dashboard.";
        setGuidePrompt(guide);

        return () => {
            setPageContext('');
        };
    }, [step, inputMode, guardrailModal, listingData, language, setPageContext, setScreenInstruction, setGuidePrompt]);

    // Commit to SQLite (Auto-save for voice or on-demand for button)
    const commitPublishListing = async (dataToSave = null) => {
        const data = dataToSave || listingDataRef.current || listingData;
        if (!data || !data.title || !data.quantity || !data.price_per_unit) {
            const warn = language === 'ta-IN' 
                ? "தயவுசெய்து பொருளின் பெயர், அளவு மற்றும் விலையை உள்ளிடவும்." 
                : "Please fill in product name, quantity, and price.";
            setStatusFeedback(warn);
            speak(warn, language);
            return;
        }

        setIsPublishing(true);
        setStatusFeedback(language === 'ta-IN' ? 'விற்பனை SQLite-ல் சேமிக்கப்படுகிறது...' : 'Auto-saving listing to SQLite...');
        try {
            const finalData = {
                seller_id: user.user_id,
                title: data.title,
                quantity: Number(data.quantity),
                unit: data.unit || 'kg',
                price_per_unit: Number(data.price_per_unit)
            };
            console.log("[Auto-saving Seller Listing to SQLite]:", finalData);
            await saveSellerListing(finalData);

            if (unmounted.current) return;
            setGuardrailModal(false);
            setStep(SELLER_STATES.PUBLISHED);

            const successMsg = language === 'ta-IN' ? "விற்பனை வெற்றிகரமாக வெளியிடப்பட்டது!" : "Listing successfully published!";
            setStatusFeedback(successMsg);
            speak(successMsg, language);
        } catch (e) {
            console.error("Publishing failed", e);
            const errMsg = language === 'ta-IN' ? "விற்பனை சேமிப்பதில் பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்." : "Error saving listing. Please try again.";
            setStatusFeedback(errMsg);
            speak(errMsg, language);
        } finally {
            setIsPublishing(false);
        }
    };

    // Trigger confirmation modal (for manual mode if needed)
    const triggerPublishGuardrail = () => {
        const data = listingDataRef.current || listingData;
        if (!data.title || !data.quantity || !data.price_per_unit) {
            const warn = language === 'ta-IN' 
                ? "தயவுசெய்து பொருளின் பெயர், அளவு மற்றும் விலையை உள்ளிடவும்." 
                : "Please fill in product name, quantity, and price.";
            setStatusFeedback(warn);
            speak(warn, language);
            return;
        }

        commitPublishListing(data);
    };

    const cancelGuardrail = () => {
        setGuardrailModal(false);
        const cancelMsg = language === 'ta-IN' ? "செயல் ரத்து செய்யப்பட்டது." : "Action cancelled.";
        setStatusFeedback(cancelMsg);
        speak(cancelMsg, language);
    };

    // Voice Processing Handler
    const handleVoiceInput = async (spokenText) => {
        if (!spokenText || unmounted.current) return;
        const norm = normalizeText(spokenText);
        console.log("[Seller Wizard Voice Input]:", spokenText);

        // Global Navigation
        if (isHomeIntent(norm)) {
            if (onBack) onBack();
            return;
        }
        if (isMyProductsIntent(norm)) {
            if (onViewListings) onViewListings();
            return;
        }

        // If all fields are already filled and user speaks any affirmation, save keyword, or general voice trigger:
        const currentData = listingDataRef.current;
        const isCurrentlyComplete = Boolean(
            currentData.title && 
            currentData.quantity && 
            currentData.price_per_unit
        );

        if (isCurrentlyComplete && (
            isAffirmativeIntent(norm) ||
            matchesAnyKeyword(norm, ['சேமி', 'சேமிக்கவும்', 'பதிவு', 'வெளியிடு', 'முடிந்தது', 'ஆர்டர்', 'save', 'publish', 'done', 'yes', 'ok', 'சரி', 'ஆம்', 'மஞ்சள்', '100', 'விலை', 'ரூபாய்'])
        )) {
            commitPublishListing(currentData);
            return;
        }

        // GUARDRAIL ACTIVE: Check for verbal "Yes" or "No"
        if (guardrailModal) {
            if (isAffirmativeIntent(spokenText)) {
                console.log("[Guardrail Affirmed]: User said Yes");
                commitPublishListing();
                return;
            }
            if (isNegativeIntent(spokenText)) {
                console.log("[Guardrail Cancelled]: User said No");
                cancelGuardrail();
                return;
            }
            speak(language === 'ta-IN' ? "உறுதிப்படுத்த 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்." : "Say 'Yes' to confirm or 'No' to cancel.", language);
            return;
        }

        // STEP 0, 1, 2 Voice Wizard Data Extraction
        if (step < SELLER_STATES.CONFIRM_1) {
            let stepKey = "";
            if (step === SELLER_STATES.PRODUCT) stepKey = "name";
            else if (step === SELLER_STATES.QUANTITY) stepKey = "quantity";
            else if (step === SELLER_STATES.PRICE) stepKey = "price";

            setStatusFeedback(language === 'ta-IN' ? 'பகுப்பாய்வு...' : 'Validating...');

            try {
                const validation = await validateCommerceStep(stepKey, spokenText, language);

                if (validation.is_valid) {
                    const data = validation.extracted_data || {};
                    const prevData = listingDataRef.current;
                    const updatedListing = { 
                        ...prevData, 
                        ...data,
                        title: data.title || (stepKey === "name" ? (data.name || spokenText) : prevData.title),
                        quantity: data.quantity !== undefined ? data.quantity : prevData.quantity,
                        unit: data.unit || prevData.unit || 'kg',
                        price_per_unit: data.price !== undefined ? data.price : (data.price_per_unit !== undefined ? data.price_per_unit : prevData.price_per_unit)
                    };
                    
                    listingDataRef.current = updatedListing;
                    setListingData(updatedListing);
                    
                    const prefix = language === 'ta-IN' ? `சரி, பதிவு செய்யப்பட்டது: ${spokenText}` : `Got it: ${spokenText}`;
                    setStatusFeedback(`✅ ${prefix}`);
                    speak(prefix, language);

                    const isAllFilledNow = Boolean(
                        updatedListing.title && 
                        updatedListing.quantity && 
                        updatedListing.price_per_unit
                    );

                    if (step === SELLER_STATES.PRICE || isAllFilledNow) {
                        // AUTO-SAVE DIRECTLY INTO SQLITE FOR VOICE!
                        setStep(SELLER_STATES.CONFIRM_1);
                        setTimeout(() => {
                            if (!unmounted.current) {
                                const savingMsg = language === 'ta-IN' 
                                    ? "அனைத்து விவரங்களும் பெறப்பட்டன! விற்பனை தானாகவே சேமிக்கப்படுகிறது..." 
                                    : "All fields complete! Auto-saving listing to SQLite...";
                                setStatusFeedback(`💾 ${savingMsg}`);
                                speak(savingMsg, language);
                                commitPublishListing(updatedListing);
                            }
                        }, 800);
                    } else {
                        setTimeout(() => {
                            if (!unmounted.current) {
                                setStep(prev => prev + 1);
                            }
                        }, 1000);
                    }
                } else {
                    const retry = validation.retry_prompt || (language === 'ta-IN' ? "எனக்கு புரியவில்லை. மீண்டும் கூறவும்." : "Please repeat.");
                    setStatusFeedback(`❌ ${retry}`);
                    speak(retry, language);
                }
            } catch (err) {
                console.error("Commerce Step Error", err);
                const errorMsg = language === 'ta-IN' ? "எனக்கு புரியவில்லை. மீண்டும் கூறவும்." : "I didn't catch that. Please repeat.";
                setStatusFeedback(errorMsg);
                speak(errorMsg, language);
            }
            return;
        }

        // Confirmation Step
        if (step === SELLER_STATES.CONFIRM_1) {
            commitPublishListing(listingDataRef.current);
        }
    };

    // Register active voice command handler
    useEffect(() => {
        registerVoiceHandler(handleVoiceInput);
        return () => unregisterVoiceHandler();
    }, [step, inputMode, guardrailModal, listingData, registerVoiceHandler, unregisterVoiceHandler]);

    useEffect(() => {
        return () => {
            unmounted.current = true;
        };
    }, []);

    // Published Success Screen
    if (step === SELLER_STATES.PUBLISHED) {
        return (
            <div className="w-full max-w-2xl text-center flex flex-col items-center p-8 pb-36">
                <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-6 shadow-[0_0_35px_rgba(16,185,129,0.7)] animate-bounce">
                    <span className="text-5xl">✅</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-black text-emerald-400">
                    {language === 'ta-IN' ? "வெற்றிகரமாக வெளியிடப்பட்டது!" : "Listing Published!"}
                </h1>
                <p className="text-gray-400 mt-3 text-lg mb-8">
                    {language === 'ta-IN' ? "வாங்குபவர்கள் உங்களை தொடர்பு கொள்வார்கள்." : "Buyers will contact you soon."}
                </p>

                <div className="w-full bg-[#09152B] p-6 rounded-2xl border border-slate-700 text-left mb-8 space-y-2">
                    <p className="text-white font-bold text-lg">{listingData.title}</p>
                    <p className="text-gray-300 text-sm">📦 {listingData.quantity} {listingData.unit} @ ₹{listingData.price_per_unit}/{listingData.unit}</p>
                    <p className="text-amber-400 font-extrabold text-xl">₹{totalAmount}</p>
                </div>

                <div className="flex gap-4">
                    <button 
                        onClick={() => {
                            setStep(SELLER_STATES.PRODUCT);
                            setListingData({ title: '', quantity: '', unit: 'kg', price_per_unit: '' });
                        }}
                        className="px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-gray-300 font-bold rounded-2xl text-base transition-all"
                    >
                        + {language === 'ta-IN' ? "இன்னொரு பொருள் சேர்க்க" : "Add Another"}
                    </button>
                    <button 
                        onClick={onViewListings}
                        className="px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black rounded-2xl text-base transition-all shadow-xl"
                    >
                        {language === 'ta-IN' ? "என் விற்பனைப் பொருட்கள்" : "View My Listings"}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl flex flex-col items-center p-6 md:p-8 pb-36 relative">
            
            {/* Top Navigation Bar */}
            <div className="w-full flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black text-white">
                        {language === 'ta-IN' ? "புதிய விற்பனை" : "New Product Listing"}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {language === 'ta-IN' ? "குரல் அல்லது தட்டச்சு வழியே எளிதாக பதிவு செய்யுங்கள்" : "Dual-input mode: Speak or type to list products"}
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

            {/* ─── DUAL-INPUT MODE SELECTOR TABS ─── */}
            <div className="w-full flex items-center justify-center mb-6">
                <div className="bg-[#081226] p-1.5 rounded-2xl border border-slate-700/80 flex items-center gap-2 shadow-xl">
                    <button
                        type="button"
                        onClick={() => {
                            setInputMode('voice');
                            speak(language === 'ta-IN' ? "குரல் பதிவு முறை. கீழே உள்ள மைக்கை தட்டி பேசவும்." : "Voice mode active. Tap bottom mic to speak.", language);
                        }}
                        className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all flex items-center gap-2 cursor-pointer ${
                            inputMode === 'voice'
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.6)]'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <span>🎙️</span>
                        <span>{t.voiceModeTab || "Voice Input Mode"}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setInputMode('manual');
                            speak(language === 'ta-IN' ? "தட்டச்சு முறை. விவரங்களை உள்ளிடவும்." : "Manual typing mode active.", language);
                        }}
                        className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all flex items-center gap-2 cursor-pointer ${
                            inputMode === 'manual'
                                ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-gray-950 shadow-[0_0_20px_rgba(245,158,11,0.6)]'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <span>⌨️</span>
                        <span>{t.typeModeTab || "Manual Typing Mode"}</span>
                    </button>
                </div>
            </div>

            {/* ─── MODE A: VOICE INPUT WIZARD ─── */}
            {inputMode === 'voice' && (
                <div className="w-full bg-[#0B152B]/90 border border-slate-700/80 rounded-3xl p-6 mb-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs uppercase font-extrabold tracking-widest text-cyan-400">
                            {language === 'ta-IN' ? `படிநிலை ${Math.min(step + 1, 3)} / 3` : `Voice Step ${Math.min(step + 1, 3)} of 3`}
                        </span>
                        <span className="text-xs font-semibold text-gray-400">
                            {step === SELLER_STATES.PRODUCT && (language === 'ta-IN' ? "1. பொருளின் பெயர்" : "1. Produce Name")}
                            {step === SELLER_STATES.QUANTITY && (language === 'ta-IN' ? "2. அளவு" : "2. Quantity")}
                            {step === SELLER_STATES.PRICE && (language === 'ta-IN' ? "3. விலை" : "3. Price")}
                            {step >= SELLER_STATES.CONFIRM_1 && (language === 'ta-IN' ? "உறுதிப்படுத்தல்" : "Confirmation")}
                        </span>
                    </div>

                    <div className="w-full grid grid-cols-3 gap-3 mb-6">
                        {[SELLER_STATES.PRODUCT, SELLER_STATES.QUANTITY, SELLER_STATES.PRICE].map((sIndex) => {
                            const isDone = step > sIndex;
                            const isCurrent = step === sIndex;
                            return (
                                <div 
                                    key={sIndex}
                                    className={`h-2.5 rounded-full transition-all duration-500 ${
                                        isDone 
                                            ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]' 
                                            : isCurrent 
                                            ? 'bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.9)] animate-pulse' 
                                            : 'bg-slate-800'
                                    }`}
                                />
                            );
                        })}
                    </div>

                    {/* Voice Prompt Banner */}
                    <div className="bg-[#060E1E] border border-cyan-500/30 rounded-2xl p-5 text-center">
                        <p className="text-xl md:text-2xl font-black text-cyan-200 mb-2">
                            {Boolean(listingData.title && listingData.quantity && listingData.price_per_unit) ? (
                                language === 'ta-IN' 
                                    ? "அனைத்து விவரங்களும் பெறப்பட்டன! விற்பனை தானாகவே சேமிக்கப்படுகிறது..." 
                                    : "All details filled! Auto-saving listing to SQLite..."
                            ) : (
                                <>
                                    {step === SELLER_STATES.PRODUCT && prompts.product}
                                    {step === SELLER_STATES.QUANTITY && prompts.quantity}
                                    {step === SELLER_STATES.PRICE && prompts.price}
                                    {step >= SELLER_STATES.CONFIRM_1 && (
                                        language === 'ta-IN' 
                                            ? `நீங்கள் ${listingData.quantity} ${listingData.unit} ${listingData.title} ₹${listingData.price_per_unit} வீதம் விற்கிறீர்கள்.` 
                                            : `Selling ${listingData.quantity} ${listingData.unit} of ${listingData.title} at ₹${listingData.price_per_unit}.`
                                    )}
                                </>
                            )}
                        </p>
                        <p className="text-xs text-gray-400">
                            {language === 'ta-IN' ? "கீழே உள்ள மைக்கை இரட்டை தட்டி உடனே பேசவும்" : "Double-tap bottom mic to speak"}
                        </p>
                        {statusFeedback && (
                            <p className="mt-3 text-sm font-bold text-amber-300 animate-pulse">
                                {statusFeedback}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* ─── MODE B: MANUAL TYPING INPUT FORM ─── */}
            {inputMode === 'manual' && (
                <div className="w-full bg-[#0B152B]/95 border border-amber-500/40 rounded-3xl p-6 md:p-8 mb-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/80">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">⌨️</span>
                            <h3 className="text-xl font-black text-amber-400">
                                {language === 'ta-IN' ? "விவரங்களை தட்டச்சு செய்யவும்" : "Manual Listing Form"}
                            </h3>
                        </div>
                        <span className="text-xs text-gray-400">
                            {language === 'ta-IN' ? "அனைத்து விவரங்களையும் நிரப்பவும்" : "Fill details & tap publish"}
                        </span>
                    </div>

                    {/* Quick Commodity Suggestion Chips */}
                    <div className="mb-6">
                        <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-2">
                            ⚡ {t.quickProduceSuggestions || "Quick Select Produce"}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {QUICK_COMMODITIES.map((c, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                        setListingData(prev => ({
                                            ...prev,
                                            title: language === 'ta-IN' ? c.local : c.title,
                                            unit: c.unit,
                                            price_per_unit: c.defaultPrice
                                        }));
                                    }}
                                    className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-800 hover:bg-amber-400/20 hover:border-amber-400 border border-slate-700 text-gray-300 hover:text-amber-300 transition-all cursor-pointer"
                                >
                                    {language === 'ta-IN' ? c.local : c.title}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Input Fields Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                        {/* 1. Produce Name */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                                {t.productNameLabel || "Produce Name"} *
                            </label>
                            <input
                                type="text"
                                value={listingData.title}
                                onChange={(e) => setListingData(prev => ({ ...prev, title: e.target.value }))}
                                placeholder={language === 'ta-IN' ? "எ.கா: காட்டுத் தேன், மஞ்சள்" : "e.g. Wild Honey, Turmeric"}
                                className="w-full bg-[#070F1E] border border-slate-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 rounded-xl px-4 py-3 text-white text-base font-bold outline-none transition-all"
                            />
                        </div>

                        {/* 2. Quantity & Unit */}
                        <div className="grid grid-cols-2 gap-3 space-y-0">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                                    {t.quantityLabel || "Quantity"} *
                                </label>
                                <input
                                    type="number"
                                    min="0.1"
                                    step="any"
                                    value={listingData.quantity}
                                    onChange={(e) => setListingData(prev => ({ ...prev, quantity: e.target.value }))}
                                    placeholder="50"
                                    className="w-full bg-[#070F1E] border border-slate-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 rounded-xl px-4 py-3 text-white text-base font-bold outline-none transition-all"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                                    {t.unitLabel || "Unit"}
                                </label>
                                <select
                                    value={listingData.unit}
                                    onChange={(e) => setListingData(prev => ({ ...prev, unit: e.target.value }))}
                                    className="w-full bg-[#070F1E] border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-3 text-white text-base font-bold outline-none transition-all cursor-pointer"
                                >
                                    <option value="kg">{language === 'ta-IN' ? "கிலோ (kg)" : "kg"}</option>
                                    <option value="litres">{language === 'ta-IN' ? "லிட்டர் (litres)" : "litres"}</option>
                                    <option value="grams">{language === 'ta-IN' ? "கிராம் (grams)" : "grams"}</option>
                                    <option value="bags">{language === 'ta-IN' ? "மூட்டை (bags)" : "bags"}</option>
                                    <option value="units">{language === 'ta-IN' ? "எண்ணிக்கை (units)" : "units"}</option>
                                </select>
                            </div>
                        </div>

                        {/* 3. Price per Unit */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                                {t.priceLabel || "Price per Unit (₹)"} *
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={listingData.price_per_unit}
                                onChange={(e) => setListingData(prev => ({ ...prev, price_per_unit: e.target.value }))}
                                placeholder="450"
                                className="w-full bg-[#070F1E] border border-slate-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 rounded-xl px-4 py-3 text-white text-base font-bold outline-none transition-all"
                            />
                        </div>

                        {/* 4. Total Amount Live Display */}
                        <div className="bg-[#070F1E] border border-slate-700 rounded-xl p-3 flex flex-col justify-center">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                {t.totalValueLabel || "Total Value"}
                            </span>
                            <span className="text-2xl font-black text-amber-400 mt-1">
                                ₹{totalAmount > 0 ? totalAmount.toLocaleString() : '0'}
                            </span>
                        </div>
                    </div>

                    {/* Manual Mode Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <button
                            type="button"
                            onClick={() => commitPublishListing(listingData)}
                            disabled={!listingData.title || !listingData.quantity || !listingData.price_per_unit || isPublishing}
                            className={`w-full py-4 px-8 rounded-2xl font-black text-lg tracking-wide transition-all shadow-xl flex items-center justify-center gap-3 cursor-pointer ${
                                listingData.title && listingData.quantity && listingData.price_per_unit && !isPublishing
                                    ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-gray-950 active:scale-95 shadow-[0_10px_25px_rgba(245,158,11,0.4)]'
                                    : 'bg-slate-800 text-gray-500 cursor-not-allowed opacity-60'
                            }`}
                        >
                            <span>📢</span>
                            <span>{isPublishing ? (language === 'ta-IN' ? "சேமிக்கப்படுகிறது..." : "Saving...") : (t.publishListingBtn || "Publish Listing")}</span>
                        </button>
                    </div>

                    {statusFeedback && (
                        <p className="mt-4 text-center text-sm font-bold text-amber-300">
                            {statusFeedback}
                        </p>
                    )}
                </div>
            )}

            {/* Produce Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                <div className={`p-5 rounded-2xl border transition-all ${listingData.title ? 'border-emerald-500/80 bg-emerald-950/20' : 'border-slate-800 bg-[#0B152B]/60'}`}>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{language === 'ta-IN' ? "பொருள்" : "Produce"}</p>
                    <p className="text-white font-black text-xl mt-1">{listingData.title ? translateField(listingData.title, language) : '---'}</p>
                </div>

                <div className={`p-5 rounded-2xl border transition-all ${listingData.quantity ? 'border-emerald-500/80 bg-emerald-950/20' : 'border-slate-800 bg-[#0B152B]/60'}`}>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{language === 'ta-IN' ? "அளவு" : "Quantity"}</p>
                    <p className="text-white font-black text-xl mt-1">
                        {listingData.quantity ? `${listingData.quantity} ${translateField(listingData.unit, language)}` : '---'}
                    </p>
                </div>

                <div className={`p-5 rounded-2xl border transition-all ${listingData.price_per_unit ? 'border-emerald-500/80 bg-emerald-950/20' : 'border-slate-800 bg-[#0B152B]/60'}`}>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{language === 'ta-IN' ? "விலை" : "Price"}</p>
                    <p className="text-white font-black text-xl mt-1">
                        {listingData.price_per_unit ? `₹${listingData.price_per_unit} / ${translateField(listingData.unit || 'unit', language)}` : '---'}
                    </p>
                </div>

                <div className={`p-5 rounded-2xl border transition-all ${totalAmount > 0 ? 'border-amber-400 bg-amber-950/30' : 'border-slate-800 bg-[#0B152B]/60'}`}>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{language === 'ta-IN' ? "மொத்த மதிப்பு" : "Total Amount"}</p>
                    <p className="text-amber-400 font-black text-2xl mt-1">{totalAmount > 0 ? `₹${totalAmount}` : '---'}</p>
                </div>
            </div>

            {/* ─── IN VOICE MODE: PROMINENT AUTO-SAVE ACTION BUTTON ─── */}
            {inputMode === 'voice' && Boolean(listingData.title && listingData.quantity && listingData.price_per_unit) && (
                <div className="w-full mt-6 flex flex-col items-center gap-2 animate-in fade-in zoom-in-95">
                    <button
                        type="button"
                        onClick={() => commitPublishListing(listingData)}
                        disabled={isPublishing}
                        className="w-full max-w-md py-4 px-8 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400 hover:from-emerald-300 hover:to-teal-300 text-gray-950 font-black text-lg rounded-2xl shadow-[0_0_35px_rgba(16,185,129,0.7)] flex items-center justify-center gap-3 transform hover:scale-105 active:scale-95 transition-all cursor-pointer"
                    >
                        <span className="text-2xl animate-spin-slow">✨</span>
                        <span>{isPublishing ? (language === 'ta-IN' ? "சேமிக்கப்படுகிறது..." : "Saving...") : (language === 'ta-IN' ? "விற்பனையை சேமிக்கவும் (Save Listing)" : "Save Listing Now")}</span>
                        <span className="text-xl">💾</span>
                    </button>
                    <p className="text-xs text-emerald-400 font-semibold text-center">
                        {language === 'ta-IN' ? "குரல் வழியே தானாக சேமிக்கப்படுகிறது • அல்லது உடனே சேமிக்க பொத்தானை தட்டவும்" : "Auto-saving by voice • or tap above to save immediately"}
                    </p>
                </div>
            )}

            {/* ─── STEP 4: VOICE CONFIRMATION GUARDRAIL MODAL ─── */}
            {guardrailModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-[#0B152B] border-2 border-amber-400 rounded-3xl p-6 md:p-8 max-w-lg w-full text-center shadow-[0_0_50px_rgba(245,158,11,0.5)] animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 rounded-full bg-amber-400/20 border-2 border-amber-400 text-amber-400 text-3xl flex items-center justify-center mx-auto mb-4">
                            🛡️
                        </div>

                        <h3 className="text-2xl font-black text-white mb-2">
                            {t.guardrailTitle || "Action Confirmation"}
                        </h3>

                        <div className="bg-[#070F1E] border border-slate-700 rounded-2xl p-4 my-4 text-left space-y-1.5">
                            <p className="text-white font-bold text-base">📦 {translateField(listingData.title, language)}</p>
                            <p className="text-gray-300 text-sm">⚖️ {listingData.quantity} {translateField(listingData.unit, language)} @ ₹{listingData.price_per_unit}/{translateField(listingData.unit, language)}</p>
                            <p className="text-amber-400 font-black text-xl">💰 ₹{totalAmount}</p>
                        </div>

                        <p className="text-cyan-200 font-bold text-base mb-6 leading-relaxed">
                            {language === 'ta-IN'
                                ? `இந்த விற்பனையை சந்தையில் வெளியிட உறுதிப்படுத்துகிறீர்களா?`
                                : `Are you sure you want to publish this listing?`}
                            <br />
                            <span className="text-amber-300 text-xs">
                                🎙️ {language === 'ta-IN' ? "உறுதி செய்ய 'ஆம்' அல்லது ரத்து செய்ய 'இல்லை' என்று சொல்லுங்கள்" : "Say 'Yes' to confirm or 'No' to cancel into mic"}
                            </span>
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={commitPublishListing}
                                disabled={isPublishing}
                                className="py-3.5 px-6 rounded-xl font-black text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span>✅</span>
                                <span>{t.confirmYes || "Yes (Confirm)"}</span>
                            </button>

                            <button
                                type="button"
                                onClick={cancelGuardrail}
                                disabled={isPublishing}
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

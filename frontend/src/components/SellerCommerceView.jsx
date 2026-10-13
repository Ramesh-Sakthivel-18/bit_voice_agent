import React, { useState, useEffect, useRef } from 'react';
import { validateCommerceStep, saveSellerListing } from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { 
    isHomeIntent, 
    isMyProductsIntent, 
    matchesAnyKeyword,
    normalizeText
} from '../utils/voiceMatcher';

const SELLER_STATES = {
    PRODUCT: 0,
    QUANTITY: 1,
    PRICE: 2,
    CONFIRM_1: 3,
    CONFIRM_2: 4,
    PUBLISHED: 5
};

export const SellerCommerceView = ({ language, user, onBack, onViewListings }) => {
    const { 
        setPageContext,
        setScreenInstruction, 
        setGuidePrompt, 
        speak,
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();

    const [step, setStep] = useState(SELLER_STATES.PRODUCT);
    const [statusFeedback, setStatusFeedback] = useState('');
    const [listingData, setListingData] = useState({ title: '', quantity: 0, unit: '', price_per_unit: 0 });
    
    const unmounted = useRef(false);

    const prompts = {
        product: language === 'ta-IN' ? "நீங்கள் என்ன பொருள் விற்க விரும்புகிறீர்கள்? சொல்லுங்கள்." : "What produce do you want to sell? Please speak.",
        quantity: language === 'ta-IN' ? "உங்களிடம் எத்தனை கிலோ அல்லது எவ்வளவு அளவு உள்ளது?" : "What is the quantity available?",
        price: language === 'ta-IN' ? "ஒரு கிலோவுக்கு நீங்கள் என்ன விலை எதிர்பார்க்கிறீர்கள்? ரூபாயில் சொல்லுங்கள்." : "What is your expected price in rupees per unit?"
    };

    // Dynamically update pageContext and screen instructions per step (Rule 2)
    useEffect(() => {
        let stepContextBadge = "";
        let promptText = "";

        if (step === SELLER_STATES.PRODUCT) {
            stepContextBadge = language === 'ta-IN' ? "1/3: பொருளின் பெயர் / Produce Name" : "1/3: Produce Name";
            promptText = prompts.product;
        } else if (step === SELLER_STATES.QUANTITY) {
            stepContextBadge = language === 'ta-IN' ? "2/3: அளவு / Quantity" : "2/3: Quantity";
            promptText = prompts.quantity;
        } else if (step === SELLER_STATES.PRICE) {
            stepContextBadge = language === 'ta-IN' ? "3/3: விலை / Price" : "3/3: Price";
            promptText = prompts.price;
        } else if (step === SELLER_STATES.CONFIRM_1) {
            stepContextBadge = language === 'ta-IN' ? "விவர உறுதிப்படுத்தல் / Confirm Details" : "Confirm Details";
            const total = listingData.quantity * (listingData.price || listingData.price_per_unit || 0);
            promptText = language === 'ta-IN'
                ? `நீங்கள் ${listingData.quantity} ${listingData.unit} ${listingData.title} ${listingData.price || listingData.price_per_unit} ரூபாய் வீதம் விற்கிறீர்கள். மொத்தம் ${total} ரூபாய். சரியா? ஆம் என்று சொல்லுங்கள்.`
                : `Selling ${listingData.quantity} ${listingData.unit} of ${listingData.title} at ₹${listingData.price || listingData.price_per_unit}. Is this correct? Say yes.`;
        } else if (step === SELLER_STATES.CONFIRM_2) {
            stepContextBadge = language === 'ta-IN' ? "இறுதி உறுதிப்படுத்தல் / Final Publish" : "Final Publish";
            promptText = language === 'ta-IN'
                ? "சந்தையில் இதை நேரலையாக வெளியிடவா? உறுதி அல்லது சரி என்று சொல்லுங்கள்."
                : "Publish to buyers now? Say confirm or yes.";
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
    }, [step, language, listingData, setPageContext, setScreenInstruction, setGuidePrompt]);

    // Step Processing Handler
    const handleStepSpeech = async (spokenText, currentStep) => {
        if (!spokenText || unmounted.current) return;
        const norm = normalizeText(spokenText);

        // Global Navigation in Wizard
        if (isHomeIntent(norm)) {
            if (onBack) onBack();
            return;
        }
        if (isMyProductsIntent(norm)) {
            if (onViewListings) onViewListings();
            return;
        }

        // Steps 0, 1, 2: Extract Produce Details
        if (currentStep < SELLER_STATES.CONFIRM_1) {
            let stepKey = "";
            if (currentStep === SELLER_STATES.PRODUCT) stepKey = "name";
            else if (currentStep === SELLER_STATES.QUANTITY) stepKey = "quantity";
            else if (currentStep === SELLER_STATES.PRICE) stepKey = "price";

            setStatusFeedback(language === 'ta-IN' ? 'பகுப்பாய்வு...' : 'Validating...');

            try {
                const validation = await validateCommerceStep(stepKey, spokenText, language);

                if (validation.is_valid) {
                    const data = validation.extracted_data;
                    setListingData(prev => ({ ...prev, ...data }));
                    
                    const prefix = language === 'ta-IN' ? `சரி, பதிவு செய்யப்பட்டது: ${spokenText}` : `Got it: ${spokenText}`;
                    setStatusFeedback(`✅ ${prefix}`);
                    speak(prefix, language);

                    setTimeout(() => {
                        if (!unmounted.current) {
                            setStep(currentStep + 1);
                        }
                    }, 1200);
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

        // Confirmation Steps: Confirm 1 & Confirm 2
        const isConfirmAffirmative = matchesAnyKeyword(spokenText, [
            'சரி', 'ஆம்', 'உறுதி', 'ஏற்றுக்கொள்', 'yes', 'ok', 'confirm', 'correct', 'right', 'ha', 'haan', 'sari'
        ]);

        if (currentStep === SELLER_STATES.CONFIRM_1) {
            if (isConfirmAffirmative) {
                setStep(SELLER_STATES.CONFIRM_2);
            } else {
                speak(language === 'ta-IN' ? "விவரங்கள் சரியானால் 'ஆம்' அல்லது 'சரி' என்று சொல்லுங்கள்." : "Say 'Yes' if details are correct.", language);
            }
            return;
        }

        if (currentStep === SELLER_STATES.CONFIRM_2) {
            if (isConfirmAffirmative) {
                setStatusFeedback(language === 'ta-IN' ? 'வெளியிடப்படுகிறது...' : 'Publishing...');
                try {
                    const finalData = {
                        seller_id: user.user_id,
                        title: listingData.title,
                        quantity: listingData.quantity,
                        unit: listingData.unit,
                        price_per_unit: listingData.price || listingData.price_per_unit
                    };
                    await saveSellerListing(finalData);

                    if (unmounted.current) return;
                    setStep(SELLER_STATES.PUBLISHED);

                    const successMsg = language === 'ta-IN' ? "வெற்றிகரமாக வெளியிடப்பட்டது!" : "Successfully published!";
                    speak(successMsg, language);
                } catch (e) {
                    console.error("Publishing failed", e);
                    setStatusFeedback("Error publishing listing.");
                }
            } else {
                speak(language === 'ta-IN' ? "நேரலையாக வெளியிட 'உறுதி' என்று சொல்லுங்கள்." : "Say 'Confirm' to publish.", language);
            }
        }
    };

    // Register active voice command handler for the active wizard step
    useEffect(() => {
        const handleVoiceInput = (rawText) => {
            console.log("[Seller Wizard Voice Input]:", rawText);
            handleStepSpeech(rawText, step);
        };

        registerVoiceHandler(handleVoiceInput);
        return () => unregisterVoiceHandler();
    }, [step, listingData, registerVoiceHandler, unregisterVoiceHandler]);

    useEffect(() => {
        return () => {
            unmounted.current = true;
        };
    }, []);

    // Total Amount Calculation
    const total = listingData.quantity * (listingData.price || listingData.price_per_unit || 0);

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
                    <p className="text-gray-300 text-sm">📦 {listingData.quantity} {listingData.unit} @ ₹{listingData.price || listingData.price_per_unit}/{listingData.unit}</p>
                    <p className="text-amber-400 font-extrabold text-xl">₹{total}</p>
                </div>

                <button 
                    onClick={onViewListings}
                    className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black rounded-2xl text-lg transition-all shadow-xl"
                >
                    {language === 'ta-IN' ? "என் விற்பனைப் பொருட்களை காண்க" : "View My Listings"}
                </button>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl flex flex-col items-center p-6 md:p-8 pb-36">
            {/* Top Navigation Bar */}
            <div className="w-full flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black text-white">
                        {language === 'ta-IN' ? "புதிய விற்பனை" : "New Product Listing"}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {language === 'ta-IN' ? "3 எளிய படிகளில் குரல் வழியே பதிவு செய்யுங்கள்" : "3-step interactive voice listing"}
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

            {/* Sleek Step Progress Indicator (No local mic buttons, no middle mic orbs) */}
            <div className="w-full bg-[#0B152B]/90 border border-slate-700/80 rounded-3xl p-6 mb-8 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-xs uppercase font-extrabold tracking-widest text-cyan-400">
                        {language === 'ta-IN' ? `படிநிலை ${Math.min(step + 1, 3)} / 3` : `Step ${Math.min(step + 1, 3)} of 3`}
                    </span>
                    <span className="text-xs font-semibold text-gray-400">
                        {step === SELLER_STATES.PRODUCT && (language === 'ta-IN' ? "பொருளின் பெயர்" : "Product Name")}
                        {step === SELLER_STATES.QUANTITY && (language === 'ta-IN' ? "அளவு" : "Quantity")}
                        {step === SELLER_STATES.PRICE && (language === 'ta-IN' ? "விலை" : "Price")}
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

                {/* Prompt Instruction Banner */}
                <div className="bg-[#060E1E] border border-cyan-500/30 rounded-2xl p-5 text-center">
                    <p className="text-xl md:text-2xl font-black text-cyan-200 mb-2">
                        {step === SELLER_STATES.PRODUCT && prompts.product}
                        {step === SELLER_STATES.QUANTITY && prompts.quantity}
                        {step === SELLER_STATES.PRICE && prompts.price}
                        {step === SELLER_STATES.CONFIRM_1 && (
                            language === 'ta-IN' 
                                ? `நீங்கள் ${listingData.quantity} ${listingData.unit} ${listingData.title} ₹${listingData.price || listingData.price_per_unit} வீதம் விற்கிறீர்கள். விவரங்கள் சரியா? 'ஆம்' என்று சொல்லுங்கள்.` 
                                : `Selling ${listingData.quantity} ${listingData.unit} of ${listingData.title} at ₹${listingData.price || listingData.price_per_unit}. Is this correct? Say 'Yes'.`
                        )}
                        {step === SELLER_STATES.CONFIRM_2 && (
                            language === 'ta-IN' 
                                ? "சந்தையில் இதை நேரலையாக வெளியிடவா? 'உறுதி' என்று சொல்லுங்கள்." 
                                : "Publish live to buyers now? Say 'Confirm' or 'Yes'."
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

            {/* Produce Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                <div className={`p-5 rounded-2xl border transition-all ${listingData.title ? 'border-emerald-500/80 bg-emerald-950/20' : 'border-slate-800 bg-[#0B152B]/60'}`}>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{language === 'ta-IN' ? "பொருள்" : "Produce"}</p>
                    <p className="text-white font-black text-xl mt-1">{listingData.title || '---'}</p>
                </div>

                <div className={`p-5 rounded-2xl border transition-all ${listingData.quantity ? 'border-emerald-500/80 bg-emerald-950/20' : 'border-slate-800 bg-[#0B152B]/60'}`}>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{language === 'ta-IN' ? "அளவு" : "Quantity"}</p>
                    <p className="text-white font-black text-xl mt-1">
                        {listingData.quantity ? `${listingData.quantity} ${listingData.unit}` : '---'}
                    </p>
                </div>

                <div className={`p-5 rounded-2xl border transition-all ${(listingData.price || listingData.price_per_unit) ? 'border-emerald-500/80 bg-emerald-950/20' : 'border-slate-800 bg-[#0B152B]/60'}`}>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{language === 'ta-IN' ? "விலை" : "Price"}</p>
                    <p className="text-white font-black text-xl mt-1">
                        {(listingData.price || listingData.price_per_unit) ? `₹${listingData.price || listingData.price_per_unit} / ${listingData.unit || 'unit'}` : '---'}
                    </p>
                </div>

                <div className={`p-5 rounded-2xl border transition-all ${total > 0 ? 'border-amber-400 bg-amber-950/30' : 'border-slate-800 bg-[#0B152B]/60'}`}>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{language === 'ta-IN' ? "மொத்த மதிப்பு" : "Total Amount"}</p>
                    <p className="text-amber-400 font-black text-2xl mt-1">{total > 0 ? `₹${total}` : '---'}</p>
                </div>
            </div>
        </div>
    );
};


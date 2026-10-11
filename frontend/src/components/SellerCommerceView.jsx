import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { playTTS, transcribeAudio, validateCommerceStep, saveSellerListing } from '../services/api';

const SELLER_STATES = {
    PRODUCT: 0,
    QUANTITY: 1,
    PRICE: 2,
    CONFIRM_1: 3,
    CONFIRM_2: 4,
    PUBLISHED: 5
};

export const SellerCommerceView = ({ language, user, onViewListings }) => {
    const [step, setStep] = useState(SELLER_STATES.PRODUCT);
    const [orbState, setOrbState] = useState('speaking'); // speaking, listening, processing
    const [transcript, setTranscript] = useState('');
    const [listingData, setListingData] = useState({ title: '', quantity: 0, unit: '', price_per_unit: 0 });
    
    const recognitionRef = useRef(null);
    const timeoutRef = useRef(null);
    const activeRef = useRef(true);
    const unmounted = useRef(false);

    const prompts = {
        product: language === 'ta-IN' ? "நீங்கள் என்ன பொருள் விற்க விரும்புகிறீர்கள்? சொல்லுங்கள்." : "What product do you want to sell? Please speak.",
        quantity: language === 'ta-IN' ? "உங்களிடம் எத்தனை கிலோ அல்லது எவ்வளவு அளவு உள்ளது?" : "What is the quantity available?",
        price: language === 'ta-IN' ? "ஒரு கிலோவுக்கு நீங்கள் என்ன விலை எதிர்பார்க்கிறீர்கள்? ரூபாயில் சொல்லுங்கள்." : "What is your expected price in rupees per unit?"
    };

    const startListening = useCallback((currentStep) => {
        if (!activeRef.current) return;
        setOrbState('listening');
        setTranscript(language === 'ta-IN' ? 'சொல்லுங்கள்...' : 'Please speak...');
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;
        
        let finalTranscript = "";

        recognition.onresult = (event) => {
            if (!activeRef.current) return;
            let interimTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            setTranscript(`"${finalTranscript || interimTranscript}"`);
            
            if (finalTranscript) {
                clearTimeout(timeoutRef.current);
                if (currentStep < SELLER_STATES.CONFIRM_1) {
                    processCommerceStepTranscript(finalTranscript, currentStep);
                } else {
                    processConfirmationTranscript(finalTranscript, currentStep);
                }
            }
        };

        recognition.onend = () => {
             if (activeRef.current && orbState === 'listening') {
                 try { recognition.start(); } catch(e){}
             }
        };

        recognitionRef.current = recognition;
        try { recognition.start(); } catch(e){}
        
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (activeRef.current) {
                if (recognitionRef.current) {
                    try { recognitionRef.current.abort(); } catch(e){}
                }
                const errorMsg = language === 'ta-IN' ? "எனக்கு புரியவில்லை. மீண்டும் கூறவும்." : "I didn't catch that. Please repeat.";
                if (currentStep < SELLER_STATES.CONFIRM_1) {
                    processStep(currentStep, errorMsg);
                } else {
                    runConfirmations(currentStep, errorMsg);
                }
            }
        }, 10000);
    }, [language, orbState]);

    const processCommerceStepTranscript = async (text, currentStep) => {
        if (!activeRef.current) return;
        activeRef.current = false;
        
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }
        
        setOrbState('processing');
        setTranscript(language === 'ta-IN' ? 'பகுப்பாய்வு...' : 'Processing...');
        
        let stepKey = "";
        if (currentStep === SELLER_STATES.PRODUCT) stepKey = "name";
        else if (currentStep === SELLER_STATES.QUANTITY) stepKey = "quantity";
        else if (currentStep === SELLER_STATES.PRICE) stepKey = "price";
        
        try {
            const validation = await validateCommerceStep(stepKey, text, language);
            
            if (validation.is_valid) {
                const data = validation.extracted_data;
                setListingData(prev => ({ ...prev, ...data }));
                
                const prefix = language === 'ta-IN' ? "சரி:" : "Got it:";
                const utter = new SpeechSynthesisUtterance(prefix);
                utter.lang = language;
                utter.volume = 0.6;
                utter.onend = () => {
                    activeRef.current = true;
                    if (unmounted.current) return;
                    setStep(currentStep + 1);
                };
                window.speechSynthesis.speak(utter);
            } else {
                setTranscript(`❌ ${validation.retry_prompt}`);
                processStep(currentStep, validation.retry_prompt);
            }
        } catch (err) {
            console.error("Commerce Step Error", err);
            const errorMsg = language === 'ta-IN' ? "எனக்கு புரியவில்லை. மீண்டும் கூறவும்." : "I didn't catch that. Please repeat.";
            processStep(currentStep, errorMsg);
        }
    };

    const processConfirmationTranscript = async (text, currentStep) => {
        if (!activeRef.current) return;
        activeRef.current = false;
        
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }
        
        if (currentStep === SELLER_STATES.CONFIRM_1) {
            activeRef.current = true;
            setStep(SELLER_STATES.CONFIRM_2);
        } else if (currentStep === SELLER_STATES.CONFIRM_2) {
            setOrbState('processing');
            setTranscript(language === 'ta-IN' ? 'வெளியிடப்படுகிறது...' : 'Publishing...');
            
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
                const utter = new SpeechSynthesisUtterance(successMsg);
                utter.lang = language;
                utter.volume = 0.6;
                window.speechSynthesis.speak(utter);
                
            } catch (e) { 
                console.error("Publishing failed", e); 
            }
        }
    };

    const processStep = useCallback((currentStep, overridePrompt = null) => {
        if (unmounted.current) return;
        activeRef.current = true;
        
        let spokenPrompt = "";
        if (currentStep === SELLER_STATES.PRODUCT) spokenPrompt = prompts.product;
        else if (currentStep === SELLER_STATES.QUANTITY) spokenPrompt = prompts.quantity;
        else if (currentStep === SELLER_STATES.PRICE) spokenPrompt = prompts.price;
        
        if (overridePrompt) spokenPrompt = overridePrompt;

        setOrbState('speaking');
        setTranscript(language === 'ta-IN' ? 'கேள்வி கேட்கிறது...' : 'Asking...');
        
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }
        window.speechSynthesis.cancel();
        
        const utter = new SpeechSynthesisUtterance(spokenPrompt);
        utter.lang = language;
        utter.volume = 0.6;
        
        utter.onend = () => startListening(currentStep);
        
        setTimeout(() => {
            if (orbState === 'speaking' && activeRef.current) {
                startListening(currentStep);
            }
        }, 8000);

        window.speechSynthesis.speak(utter);
    }, [language, prompts, startListening, orbState]);

    const runConfirmations = useCallback((currentStep, overridePrompt = null) => {
        if (unmounted.current) return;
        activeRef.current = true;
        
        const total = listingData.quantity * (listingData.price || listingData.price_per_unit || 0);
        const title = listingData.title;
        const qty = listingData.quantity;
        const unit = listingData.unit;
        const price = listingData.price || listingData.price_per_unit;
        
        let promptText = overridePrompt;
        
        if (!promptText) {
            if (currentStep === SELLER_STATES.CONFIRM_1) {
                promptText = language === 'ta-IN' 
                    ? `நீங்கள் ${qty} ${unit} ${title} ${price} ரூபாய் வீதம் விற்கிறீர்கள். மொத்தம் ${total} ரூபாய். விவரங்கள் சரியா? ஆம் என்று சொல்லுங்கள்.` 
                    : `You are selling ${qty} ${unit} of ${title} at ${price} rupees each. Total is ${total} rupees. Is this correct? Say yes.`;
            } else if (currentStep === SELLER_STATES.CONFIRM_2) {
                promptText = language === 'ta-IN' 
                    ? "கடைசியாக உறுதிப்படுத்துகிறேன். சந்தையில் இதை நேரலையாக வெளியிடவா? உறுதி என்று சொல்லுங்கள்." 
                    : "Confirming one last time. Publish to buyers now? Say confirm.";
            }
        }
        
        setOrbState('speaking');
        setTranscript(promptText);
        
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }
        window.speechSynthesis.cancel();
        
        const utter = new SpeechSynthesisUtterance(promptText);
        utter.lang = language;
        utter.volume = 0.6;
        
        utter.onend = () => startListening(currentStep);
        window.speechSynthesis.speak(utter);
        
    }, [listingData, language, startListening]);

    useEffect(() => {
        if (step < SELLER_STATES.CONFIRM_1) {
            processStep(step);
        } else if (step === SELLER_STATES.CONFIRM_1 || step === SELLER_STATES.CONFIRM_2) {
            runConfirmations(step);
        }
    }, [step]);

    useEffect(() => {
        return () => {
            unmounted.current = true;
            activeRef.current = false;
            clearTimeout(timeoutRef.current);
            window.speechSynthesis.cancel();
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch(e){}
            }
        };
    }, []);

    // Visuals
    const total = listingData.quantity * (listingData.price || listingData.price_per_unit || 0);

    if (step === SELLER_STATES.PUBLISHED) {
        return (
            <div className="w-full max-w-2xl text-center flex flex-col items-center">
                <div className="text-8xl mb-8">✅</div>
                <h1 className="text-4xl font-bold text-green-400">
                    {language === 'ta-IN' ? "வெற்றிகரமாக வெளியிடப்பட்டது!" : "Listing Published!"}
                </h1>
                <p className="text-gray-400 mt-4 text-xl mb-12">
                    {language === 'ta-IN' ? "வாங்குபவர்கள் உங்களை தொடர்பு கொள்வார்கள்." : "Buyers will contact you soon."}
                </p>
                <button 
                    onClick={onViewListings}
                    className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-2xl transition-colors shadow-lg shadow-green-600/30"
                >
                    {language === 'ta-IN' ? "என் விற்பனைப் பொருட்களை காண்க" : "View My Listings"}
                </button>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl flex flex-col items-center p-8">
            <h1 className="text-4xl font-bold text-white mb-8">
                {language === 'ta-IN' ? "புதிய விற்பனை" : "New Listing"}
            </h1>

            {/* The Voice Orb */}
            <div className="relative w-40 h-40 mb-10 flex items-center justify-center">
                {orbState === 'speaking' && (
                    <>
                        <div className="absolute inset-0 rounded-full bg-purple-500 opacity-40 animate-ping"></div>
                        <div className="relative z-10 w-28 h-28 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 shadow-[0_0_50px_rgba(147,51,234,0.8)] flex items-center justify-center">
                            <span className="text-5xl">🤖</span>
                        </div>
                    </>
                )}
                {orbState === 'listening' && (
                    <>
                        <div className="absolute inset-0 rounded-full bg-green-500 opacity-50 animate-ping"></div>
                        <div className="relative z-10 w-28 h-28 rounded-full bg-green-500 shadow-[0_0_60px_rgba(34,197,94,0.9)] flex items-center justify-center">
                            <span className="text-5xl">🎙️</span>
                        </div>
                    </>
                )}
                {orbState === 'processing' && (
                    <div className="relative z-10 w-28 h-28 rounded-full bg-yellow-500 shadow-[0_0_60px_rgba(234,179,8,0.9)] flex items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-white"></div>
                    </div>
                )}
            </div>

            <div className="mb-10 px-8 py-4 rounded-xl border border-gray-700 bg-gray-900/50 text-xl font-bold text-center text-blue-300 min-w-[300px]">
                {transcript}
            </div>

            {/* Visual Display Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                <div className={`p-4 rounded-xl border ${listingData.title ? 'border-green-500 bg-green-900/20' : 'border-gray-700 bg-gray-800'}`}>
                    <p className="text-gray-400 text-sm">{language === 'ta-IN' ? "பொருள்" : "Produce"}</p>
                    <p className="text-white font-bold text-lg">{listingData.title || '---'}</p>
                </div>
                <div className={`p-4 rounded-xl border ${listingData.quantity ? 'border-green-500 bg-green-900/20' : 'border-gray-700 bg-gray-800'}`}>
                    <p className="text-gray-400 text-sm">{language === 'ta-IN' ? "அளவு" : "Quantity"}</p>
                    <p className="text-white font-bold text-lg">
                        {listingData.quantity ? `${listingData.quantity} ${listingData.unit}` : '---'}
                    </p>
                </div>
                <div className={`p-4 rounded-xl border ${(listingData.price || listingData.price_per_unit) ? 'border-green-500 bg-green-900/20' : 'border-gray-700 bg-gray-800'}`}>
                    <p className="text-gray-400 text-sm">{language === 'ta-IN' ? "விலை" : "Price"}</p>
                    <p className="text-white font-bold text-lg">
                        {(listingData.price || listingData.price_per_unit) ? `₹${listingData.price || listingData.price_per_unit} / ${listingData.unit || 'unit'}` : '---'}
                    </p>
                </div>
                <div className={`p-4 rounded-xl border ${total > 0 ? 'border-brightYellow bg-yellow-900/20' : 'border-gray-700 bg-gray-800'}`}>
                    <p className="text-gray-400 text-sm">{language === 'ta-IN' ? "மொத்த மதிப்பு" : "Total Amount"}</p>
                    <p className="text-brightYellow font-bold text-xl">{total > 0 ? `₹${total}` : '---'}</p>
                </div>
            </div>
        </div>
    );
};

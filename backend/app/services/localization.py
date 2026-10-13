import logging
import json
from typing import Dict, Any, Optional
from app.services.voice_service import groq_client

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {
    "ta-IN": "Tamil",
    "ta": "Tamil",
    "hi-IN": "Hindi",
    "hi": "Hindi",
    "te-IN": "Telugu",
    "te": "Telugu",
    "kn-IN": "Kannada",
    "kn": "Kannada",
    "ml-IN": "Malayalam",
    "ml": "Malayalam",
    "mr-IN": "Marathi",
    "mr": "Marathi",
    "bn-IN": "Bengali",
    "bn": "Bengali",
    "gu-IN": "Gujarati",
    "gu": "Gujarati",
    "or-IN": "Odia",
    "or": "Odia",
    "pa-IN": "Punjabi",
    "pa": "Punjabi",
    "en-IN": "English",
    "en-US": "English",
    "en": "English",
}

# High-fidelity localized prompt bank for core transactional operations
LOCALIZED_PROMPTS = {
    "seller_buyer_interested": {
        "en": "You have a buyer interested. Say 'Accept' to invite.",
        "ta": "உங்களிடம் ஒரு வாங்குபவர் ஆர்வமாக உள்ளார். அழைக்க 'ஏற்றுக்கொள்' என்று சொல்லுங்கள்.",
        "hi": "आपके पास एक इच्छुक खरीदार है। आमंत्रित करने के लिए 'स्वीकार' कहें।",
        "te": "మీ వద్ద ఒక ఆసక్తిగల కొనుగోలుదారు ఉన్నారు. ఆహ్వానించడానికి 'అంగీకరించు' అని చెప్పండి.",
        "kn": "ನಿಮ್ಮಲ್ಲಿ ಆಸಕ್ತ ಖರೀದಿದಾರರಿದ್ದಾರೆ. ಆಹ್ವಾನಿಸಲು 'ಒಪ್ಪಿಕೊಳ್ಳಿ' ಎಂದು ಹೇಳಿ.",
        "ml": "നിങ്ങൾക്ക് താൽപ്പര്യമുള്ള ഒരു വാങ്ങുന്നയാളുണ്ട്. ക്ഷണിക്കാൻ 'സ്വീകരിക്കുക' എന്ന് പറയുക.",
        "mr": "तुमच्याकडे एक इच्छुक खरेदीदार आहे. आमंत्रित करण्यासाठी 'स्वीकारा' म्हणा.",
        "bn": "আপনার কাছে একজন আগ্রহী ক্রেতা আছেন। আমন্ত্রণ জানাতে 'গ্রহণ' বলুন।",
        "gu": "તમારી પાસે રસ ધરાવતો ખરીદદાર છે. આમંત્રિત કરવા માટે 'સ્વીકારો' કહો.",
        "or": "ଆପଣଙ୍କର ଜଣେ ଆଗ୍ରହୀ କ୍ରେତା ଅଛନ୍ତି। ନିମନ୍ତ୍ରଣ କରିବାକୁ 'ଗ୍ରହଣ' କୁହନ୍ତୁ।",
        "pa": "ਤੁਹਾਡੇ ਕੋਲ ਇੱਕ ਦਿਲਚਸਪੀ ਰੱਖਣ ਵਾਲਾ ਖਰੀਦਦਾਰ ਹੈ। ਸੱਦਾ ਦੇਣ ਲਈ 'ਸਵੀਕਾਰ' ਕਹੋ।"
    },
    "seller_invitation_accepted": {
        "en": "Invitation accepted. Buyer will now proceed to secure payment.",
        "ta": "அழைப்பு ஏற்றுக்கொள்ளப்பட்டது. வாங்குபவர் இப்போது பாதுகாப்பான கட்டணத்திற்கு செல்வார்.",
        "hi": "निमंत्रण स्वीकार कर लिया गया। खरीदार अब सुरक्षित भुगतान के लिए आगे बढ़ेगा।",
        "te": "ఆహ్వానం ఆమోదించబడింది. కొనుగోలుదారు ఇప్పుడు సురక్షిత చెల్లింపుకు కొనసాగుతారు.",
        "kn": "ಆಹ್ವಾನ ಒಪ್ಪಿಕೊಳ್ಳಲಾಗಿದೆ. ಖರೀದಿದಾರರು ಈಗ ಸುರಕ್ಷಿತ ಪಾವತಿಗೆ ಮುಂದುವರಿಯುತ್ತಾರೆ.",
        "ml": "ക്ഷണം സ്വീകരിച്ചു. വാങ്ങുന്നയാൾ ഇനി സുരക്ഷിത പേയ്‌മെന്റിലേക്ക് നീങ്ങും.",
        "mr": "निमंत्रण स्वीकारले. खरेदीदार आता सुरक्षित पेमेंटसाठी पुढे जाईल.",
        "bn": "আমন্ত্রণ গৃহীত হয়েছে। ক্রেতা এখন নিরাপদ অর্থপ্রদানের দিকে এগিয়ে যাবেন।",
        "gu": "આમંત્રણ સ્વીકાર્યું. ખરીદનાર હવે સુરક્ષિત ચુકવણી માટે આગળ વધશે.",
        "or": "ନିମନ୍ତ୍ରଣ ଗ୍ରହଣ କରାଗଲା। କ୍ରେତା ଏବେ ସୁରକ୍ଷିତ ଦେୟ ପ୍ରଦାନ କରିବେ।",
        "pa": "ਸੱਦਾ ਸਵੀਕਾਰ ਕੀਤਾ ਗਿਆ। ਖਰੀਦਦਾਰ ਹੁਣ ਸੁਰੱਖਿਅਤ ਭੁਗਤਾਨ ਲਈ ਅੱਗੇ ਵਧੇਗਾ।"
    },
    "buyer_interest_recorded": {
        "en": "Your interest has been recorded. Waiting for seller to accept your invitation.",
        "ta": "உங்கள் ஆர்வம் பதிவு செய்யப்பட்டது. விற்பனையாளர் அழைப்பை ஏற்கும் வரை காத்திருக்கவும்.",
        "hi": "आपकी रुचि दर्ज कर ली गई है। विक्रेता द्वारा निमंत्रण स्वीकार करने की प्रतीक्षा है।",
        "te": "మీ ఆసక్తి నమోదు చేయబడింది. విక్రేత ఆహ్వానాన్ని ఆమోదించే వరకు వేచి ఉండండి.",
        "kn": "ನಿಮ್ಮ ಆಸಕ್ತಿ ದಾಖಲಾಗಿದೆ. ಮಾರಾಟಗಾರರು ನಿಮ್ಮ ಆಹ್ವಾನವನ್ನು ಸ್ವೀಕರಿಸುವವರೆಗೆ ಕಾಯಿರಿ.",
        "ml": "നിങ്ങളുടെ താൽപ്പര്യം രേഖപ്പെടുത്തി. വിൽപ്പനക്കാരൻ നിങ്ങളുടെ ക്ഷണം സ്വീകരിക്കുന്നതിനായി കാത്തിരിക്കുന്നു.",
        "mr": "तुमची आवड नोंदवली गेली आहे. विक्रेत्याने आमंत्रण स्वीकारण्याची वाट पाहत आहे.",
        "bn": "আপনার আগ্রহ নথিভুক্ত করা হয়েছে। বিক্রেতার আমন্ত্রণের জন্য অপেক্ষা করা হচ্ছে।",
        "gu": "તમારો રસ નોંધાયો છે. વેચનાર તમારા આમંત્રણને સ્વીકારે ત્યાં સુધી રાહ જુઓ.",
        "or": "ଆପଣଙ୍କ ଆଗ୍ରହ ରେକର୍ଡ ହୋଇଛି। ବିକ୍ରେତା ନିମନ୍ତ୍ରଣ ଗ୍ରହଣ କରିବା ପର୍ଯ୍ୟନ୍ତ ଅପେକ୍ଷା କରନ୍ତୁ।",
        "pa": "ਤੁਹਾਡੀ ਦਿਲਚਸਪੀ ਦਰਜ ਕੀਤੀ ਗਈ ਹੈ। ਵਿਕਰੇਤਾ ਦੁਆਰਾ ਸੱਦਾ ਸਵੀਕਾਰ ਕਰਨ ਦੀ ਉਡੀਕ ਕੀਤੀ ਜਾ ਰਹੀ ਹੈ।"
    },
    "buyer_checkout_prompt": {
        "en": "Seller accepted your invitation! Please review your order of ₹{amount} and complete payment.",
        "ta": "விற்பனையாளர் உங்கள் அழைப்பை ஏற்றுக்கொண்டார்! ₹{amount} ஆர்டரை மதிப்பாய்வு செய்து பணம் செலுத்துங்கள்.",
        "hi": "विक्रेता ने आपका निमंत्रण स्वीकार कर लिया! कृपया अपने ₹{amount} के ऑर्डर की समीक्षा करें और भुगतान पूरा करें।",
        "te": "విక్రేత మీ ఆహ్వానాన్ని ఆమోదించారు! దయచేసి మీ ₹{amount} ఆర్డర్‌ను సమీక్షించి చెల్లింపును పూర్తి చేయండి.",
        "kn": "ಮಾರಾಟಗಾರರು ನಿಮ್ಮ ಆಹ್ವಾನವನ್ನು ಸ್ವೀಕರಿಸಿದ್ದಾರೆ! ದಯವಿಟ್ಟು ₹{amount} ನ ಆರ್ಡರ್ ಪರಿಶೀಲಿಸಿ ಪಾವತಿ ಪೂರ್ಣಗೊಳಿಸಿ.",
        "ml": "വിൽപ്പനക്കാരൻ നിങ്ങളുടെ ക്ഷണം സ്വീകരിച്ചു! ദയവായി നിങ്ങളുടെ ₹{amount} ഓർഡർ അവലോകനം ചെയ്ത് പേയ്‌മെന്റ് പൂർത്തിയാക്കുക.",
        "mr": "विक्रेत्याने तुमचे आमंत्रण स्वीकारले! कृपया तुमच्या ₹{amount} च्या ऑर्डरचे पुनरावलोकन करा आणि पेमेंट पूर्ण करा.",
        "bn": "বিক্রেতা আপনার আমন্ত্রণ গ্রহণ করেছেন! দয়া করে আপনার ₹{amount} অর্ডারের পর্যালোচনা করুন এবং অর্থপ্রদান সম্পূর্ণ করুন।",
        "gu": "વેચનારે તમારું આમંત્રણ સ્વીકાર્યું! કૃપા કરીને તમારા ₹{amount} ના ઓર્ડરની સમીક્ષા કરો અને ચુકવણી પૂર્ણ કરો.",
        "or": "ବିକ୍ରେତା ଆପଣଙ୍କ ନିମନ୍ତ୍ରଣ ଗ୍ରହଣ କଲେ! ଦୟାକରି ଆପଣଙ୍କର ₹{amount} ଅର୍ଡର ସମୀକ୍ଷା କରି ଦେୟ ସମ୍ପୂର୍ଣ୍ଣ କରନ୍ତୁ।",
        "pa": "ਵਿਕਰੇਤਾ ਨੇ ਤੁਹਾਡਾ ਸੱਦਾ ਸਵੀਕਾਰ ਕਰ ਲਿਆ! ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ ₹{amount} ਦੇ ਆਰਡਰ ਦੀ ਸਮੀਖਿਆ ਕਰੋ ਅਤੇ ਭੁਗਤਾਨ ਪੂਰਾ ਕਰੋ।"
    },
    "payment_processing": {
        "en": "Processing Secure Payment... Please wait 10 seconds.",
        "ta": "பாதுகாப்பான கட்டணம் செயலாக்கப்படுகிறது... தயவுசெய்து காத்திருக்கவும்.",
        "hi": "सुरक्षित भुगतान संसाधित हो रहा है... कृपया प्रतीक्षा करें।",
        "te": "సురక్షిత చెల్లింపు ప్రాసెస్ అవుతోంది... దయచేసి వేచి ఉండండి.",
        "kn": "ಸುರಕ್ಷಿತ ಪಾವತಿ ಪ್ರಕ್ರಿಯೆಯಲ್ಲಿದೆ... ದಯವಿಟ್ಟು ಕಾಯಿರಿ.",
        "ml": "സുരക്ഷിത പേയ്‌മെന്റ് പ്രോസസ്സ് ചെയ്യുന്നു... ദയവായി കാത്തിരിക്കുക.",
        "mr": "सुरक्षित पेमेंट प्रक्रिया सुरू आहे... कृपया प्रतीक्षा करा.",
        "bn": "নিরাপদ অর্থপ্রদান প্রক্রিয়াকরণ হচ্ছে... দয়া করে অপেক্ষা করুন।",
        "gu": "સુરક્ષિત ચુકવણી પ્રક્રિયા ચાલુ છે... કૃપા કરીને રાહ જુઓ.",
        "or": "ସୁରକ୍ଷିତ ଦେୟ ପ୍ରକ୍ରିୟାକରଣ ଚାଲିଛି... ଦୟାକରି ଅପେକ୍ଷା କରନ୍ତୁ।",
        "pa": "ਸੁਰੱਖਿਅਤ ਭੁਗਤਾਨ ਦੀ ਪ੍ਰਕਿਰਿਆ ਜਾਰੀ ਹੈ... ਕਿਰਪਾ ਕਰਕੇ ਉਡੀਕ ਕਰੋ।"
    },
    "payment_paid_buyer": {
        "en": "Payment successful! ₹{amount} paid. Your order is confirmed and processing.",
        "ta": "பணம் வெற்றிகரமாக செலுத்தப்பட்டது! ₹{amount} செலுத்தப்பட்டது. உங்கள் ஆர்டர் உறுதி செய்யப்பட்டு செயலாக்கத்தில் உள்ளது.",
        "hi": "भुगतान सफल! ₹{amount} का भुगतान किया गया। आपका ऑर्डर कन्फर्म है और प्रोसेस हो रहा है।",
        "te": "చెల్లింపు విజయవంతమైంది! ₹{amount} చెల్లించబడింది. మీ ఆర్డర్ నిర్ధారించబడింది మరియు ప్రాసెస్ అవుతోంది.",
        "kn": "ಪಾವತಿ ಯಶಸ್ವಿಯಾಗಿದೆ! ₹{amount} ಪಾವತಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ಆರ್ಡರ್ ದೃಢೀಕರಿಸಲ್ಪಟ್ಟಿದೆ ಮತ್ತು ಪ್ರಕ್ರಿಯೆಯಲ್ಲಿದೆ.",
        "ml": "പേയ്‌മെന്റ് വിജയിച്ചു! ₹{amount} അടച്ചു. നിങ്ങളുടെ ഓർഡർ സ്ഥിരീകരിച്ചു, പ്രോസസ്സിംഗിലാണ്.",
        "mr": "पेमेंट यशस्वी झाले! ₹{amount} भरले. तुमची ऑर्डर कन्फर्म झाली असून प्रक्रियेत आहे.",
        "bn": "অর্থপ্রদান সফল হয়েছে! ₹{amount} প্রদান করা হয়েছে। আপনার অর্ডার নিশ্চিত এবং প্রক্রিয়াকরণ হচ্ছে।",
        "gu": "ચુકવણી સફળ રહી! ₹{amount} ચૂકવ્યા. તમારો ઓર્ડર કન્ફર્મ થઈ ગયો છે અને પ્રક્રિયા હેઠળ છે.",
        "or": "ଦେୟ ସଫଳ ହେଲା! ₹{amount} ପ୍ରଦାନ କରାଗଲା। ଆପଣଙ୍କ ଅର୍ଡର ନିଶ୍ଚିତ ହୋଇଛି ଏବଂ ପ୍ରକ୍ରିୟାକରଣ ଚାଲିଛି।",
        "pa": "ਭੁਗਤਾਨ ਸਫਲ ਰਿਹਾ! ₹{amount} ਅਦਾ ਕੀਤੇ ਗਏ। ਤੁਹਾਡਾ ਆਰਡਰ ਪੁਸ਼ਟੀ ਹੋ ਗਿਆ ਹੈ ਅਤੇ ਪ੍ਰਕਿਰਿਆ ਵਿੱਚ ਹੈ।"
    },
    "seller_amount_received": {
        "en": "Amount Received: ₹{amount} for {item_title}. Order confirmed and processing.",
        "ta": "தொகை ₹{amount} பெறப்பட்டது. {item_title}க்கான ஆர்டர் உறுதி செய்யப்பட்டு செயலாக்கத்தில் உள்ளது.",
        "hi": "राशि प्राप्त हुई: {item_title} के लिए ₹{amount}। ऑर्डर कन्फर्म हो गया है और प्रोसेस हो रहा है।",
        "te": "మొత్తం అందింది: {item_title} కోసం ₹{amount}. ఆర్డర్ నిర్ధారించబడింది మరియు ప్రాసెస్ అవుతోంది.",
        "kn": "{item_title} ಗಾಗಿ ₹{amount} ಮೊತ್ತ ಸ್ವೀಕರಿಸಲಾಗಿದೆ. ಆರ್ಡರ್ ದೃಢೀಕರಿಸಲ್ಪಟ್ಟಿದೆ ಮತ್ತು ಪ್ರಕ್ರಿಯೆಯಲ್ಲಿದೆ.",
        "ml": "{item_title} ഇനത്തിനായി ₹{amount} തുക ലഭിച്ചു. ഓർഡർ സ്ഥിരീകരിച്ചു, പ്രോസസ്സിംഗിലാണ്.",
        "mr": "{item_title} साठी ₹{amount} रक्कम मिळाली. ऑर्डर कन्फर्म झाली असून प्रक्रियेत आहे.",
        "bn": "{item_title} এর জন্য ₹{amount} টাকা গৃহীত হয়েছে। অর্ডার নিশ্চিত এবং প্রক্রিয়াকরণ হচ্ছে।",
        "gu": "{item_title} માટે ₹{amount} રકમ મળી. ઓર્ડર કન્ફર્મ થયો છે અને પ્રક્રિયા હેઠળ છે.",
        "or": "{item_title} ପାଇଁ ₹{amount} ଟଙ୍କା ଗ୍ରହଣ କରାଗଲା। ଅର୍ଡର ନିଶ୍ଚିତ ହୋଇଛି ଏବଂ ପ୍ରକ୍ରିୟାକରଣ ଚାଲିଛି।",
        "pa": "{item_title} ਲਈ ₹{amount} ਰਕਮ ਪ੍ਰਾਪਤ ਹੋਈ। ਆਰਡਰ ਪੁਸ਼ਟੀ ਹੋ ਗਿਆ ਹੈ ਅਤੇ ਪ੍ਰਕਿਰਿਆ ਵਿੱਚ ਹੈ।"
    },
    # Screen instruction prompts for single-tap TTS
    "screen_buyer_dashboard": {
        "en": "Buyer Home. Tap the mic once to hear instructions. Double-tap to search products by voice.",
        "ta": "வாங்குபவர் முகப்பு. வழிமுறைகளைக் கேட்க மைக்ரோஃபோனை ஒருமுறை தட்டவும். குரல் மூலம் தேட இருமுறை தட்டவும்.",
        "hi": "खरीदार होम स्क्रीन। निर्देश सुनने के लिए माइक पर एक बार टैप करें। बोलकर उत्पाद खोजने के लिए दो बार टैप करें।",
        "te": "కొనుగోలుదారు హోమ్ స్క్రీన్. సూచనలను వినడానికి మైక్‌పై ఒకసారి నొక్కండి. మాట్లాడి శోధించడానికి రెండుసార్లు నొక్కండి.",
        "kn": "ಖರೀದಿದಾರರ ಮುಖಪುಟ. ಸೂಚನೆಗಳನ್ನು ಕೇಳಲು ಮೈಕ್ ಅನ್ನು ಒಮ್ಮೆ ಟ್ಯಾಪ್ ಮಾಡಿ. ಧ್ವನಿಯ ಮೂಲಕ ಹುಡುಕಲು ಎರಡು ಬಾರಿ ಟ್ಯಾಪ್ ಮಾಡಿ.",
        "ml": "വാങ്ങുന്നയാളുടെ ഹോം സ്ക്രീൻ. നിർദ്ദേശങ്ങൾ കേൾക്കാൻ മൈക്കിൽ ഒരു തവണ ടാപ്പ് ചെയ്യുക. തിരയാൻ രണ്ട് തവണ ടാപ്പ് ചെയ്യുക.",
        "mr": "खरेदीदार मुख्यपृष्ठ. सूचना ऐकण्यासाठी माइकवर एकदा टॅप करा. आवाजाने शोधण्यासाठी दोनदा टॅप करा.",
        "bn": "ক্রেতার হোম স্ক্রিন। নির্দেশাবলী শুনতে মাইকে একবার ট্যাপ করুন। ভয়েস দিয়ে খুঁজতে দুবার ট্যাপ করুন।",
        "gu": "ખરીદનાર હોમ સ્ક્રીન. સૂચનાઓ સાંભળવા માટે માઇક પર એકવાર ટેપ કરો. અવાજ દ્વારા શોધવા માટે બે વાર ટેપ કરો.",
        "or": "କ୍ରେତା ମୁଖ୍ୟ ପୃଷ୍ଠା। ନିର୍ଦ୍ଦେଶାବଳୀ ଶୁଣିବା ପାଇଁ ମାଇକ୍ ଉପରେ ଥରେ ଟ୍ୟାପ୍ କରନ୍ତୁ। ଖୋଜିବା ପାଇଁ ଦୁଇଥର ଟ୍ୟାପ୍ କରନ୍ତୁ।",
        "pa": "ਖਰੀਦਦਾਰ ਮੁੱਖ ਸਕ੍ਰੀਨ। ਹਦਾਇਤਾਂ ਸੁਣਨ ਲਈ ਮਾਈਕ 'ਤੇ ਇੱਕ ਵਾਰ ਟੈਪ ਕਰੋ। ਆਵਾਜ਼ ਦੁਆਰਾ ਖੋਜਣ ਲਈ ਦੋ ਵਾਰ ਟੈਪ ਕਰੋ।"
    },
    "screen_seller_dashboard": {
        "en": "Seller Home. Tap the mic once to hear instructions. Double-tap to accept buyer requests or list items.",
        "ta": "விற்பனையாளர் முகப்பு. வழிமுறைகளைக் கேட்க மைக்ரோஃபோனை ஒருமுறை தட்டவும். வாங்குபவர் கோரிக்கைகளை ஏற்க இருமுறை தட்டவும்.",
        "hi": "विक्रेता होम स्क्रीन। निर्देश सुनने के लिए माइक पर एक बार टैप करें। खरीदार के अनुरोध स्वीकार करने के लिए दो बार टैप करें।",
        "te": "విక్రేత హోమ్ స్క్రీన్. సూచనలను వినడానికి మైక్‌పై ఒకసారి నొక్కండి. కొనుగోలుదారు అభ్యర్థనలను ఆమోదించడానికి రెండుసార్లు నొక్కండి.",
        "kn": "ಮಾರಾಟಗಾರರ ಮುಖಪುಟ. ಸೂಚನೆಗಳನ್ನು ಕೇಳಲು ಮೈಕ್ ಅನ್ನು ಒಮ್ಮೆ ಟ್ಯಾಪ್ ಮಾಡಿ. ಖರೀದಿದಾರರ ವಿನಂತಿಗಳನ್ನು ಸ್ವೀಕರಿಸಲು ಎರಡು ಬಾರಿ ಟ್ಯಾಪ್ ಮಾಡಿ.",
        "ml": "വിൽപ്പനക്കാരന്റെ ഹോം സ്ക്രീൻ. നിർദ്ദേശങ്ങൾ കേൾക്കാൻ മൈക്കിൽ ഒരു തവണ ടാപ്പ് ചെയ്യുക. അപേക്ഷകൾ സ്വീകരിക്കാൻ രണ്ട് തവണ ടാപ്പ് ചെയ്യുക.",
        "mr": "विक्रेता मुख्यपृष्ठ. सूचना ऐकण्यासाठी माइकवर एकदा टॅप करा. खरेदीदाराच्या विनंत्या स्वीकारण्यासाठी दोनदा टॅप करा.",
        "bn": "বিক্রেতার হোম স্ক্রিন। নির্দেশাবলী শুনতে মাইকে একবার ট্যাপ করুন। ক্রেতার অনুরোধ গ্রহণ করতে দুবার ট্যাপ করুন।",
        "gu": "વેચનાર હોમ સ્ક્રીન. સૂચનાઓ સાંભળવા માટે માઇક પર એકવાર ટેપ કરો. ખરીદનારની વિનંતીઓ સ્વીકારવા બે વાર ટેપ કરો.",
        "or": "ବିକ୍ରେତା ମୁଖ୍ୟ ପୃଷ୍ଠା। ନିର୍ଦ୍ଦେଶାବଳୀ ଶୁଣିବା ପାଇଁ ମାଇକ୍ ଉପରେ ଥରେ ଟ୍ୟାପ୍ କରନ୍ତୁ। ଅନୁରୋଧ ଗ୍ରହଣ କରିବାକୁ ଦୁଇଥର ଟ୍ୟାପ୍ କରନ୍ତୁ।",
        "pa": "ਵਿਕਰੇਤਾ ਮੁੱਖ ਸਕ੍ਰੀਨ। ਹਦਾਇਤਾਂ ਸੁਣਨ ਲਈ ਮਾਈਕ 'ਤੇ ਇੱਕ ਵਾਰ ਟੈਪ ਕਰੋ। ਖਰੀਦਦਾਰ ਦੀਆਂ ਬੇਨਤੀਆਂ ਸਵੀਕਾਰ ਕਰਨ ਲਈ ਦੋ ਵਾਰ ਟੈਪ ਕਰੋ।"
    },
    "screen_buyer_checkout": {
        "en": "Secure Checkout. Tap Pay Now or double-tap the mic to speak Pay to complete 10-second payment.",
        "ta": "பாதுகாப்பான பணம் செலுத்துதல். பணம் செலுத்த பொத்தானை தட்டவும் அல்லது மைக்ரோஃபோனை இருமுறை தட்டி பணம் என்று கூறவும்.",
        "hi": "सुरक्षित चेकआउट। भुगतान करने के लिए 'पे नाउ' दबाएं या माइक पर दो बार टैप करके 'भुगतान' बोलें।",
        "te": "సురక్షిత చెక్అవుట్. చెల్లించడానికి బటన్ నొక్కండి లేదా మైక్‌పై రెండుసార్లు నొక్కి 'చెల్లించు' అని చెప్పండి.",
        "kn": "ಸುರಕ್ಷಿತ ಚೆಕ್‌ಔಟ್. ಪಾವತಿಸಲು ಬಟನ್ ಟ್ಯಾಪ್ ಮಾಡಿ ಅಥವಾ ಮೈಕ್ ಅನ್ನು ಎರಡು ಬಾರಿ ಟ್ಯಾಪ್ ಮಾಡಿ 'ಪಾವತಿಸಿ' ಎಂದು ಹೇಳಿ.",
        "ml": "സുരക്ഷിത ചെക്ക്ഔട്ട്. പണമടയ്ക്കാൻ ബട്ടൺ ടാപ്പ് ചെയ്യുക അല്ലെങ്കിൽ മൈക്കിൽ രണ്ട് തവണ ടാപ്പ് ചെയ്ത് 'പേ' എന്ന് പറയുക.",
        "mr": "सुरक्षित चेकआउट. पेमेंट करण्यासाठी बटण दाबा किंवा माइकवर दोनदा टॅप करून 'पे' म्हणा.",
        "bn": "নিরাপদ চেকআউট। অর্থপ্রদান করতে বোতামে ট্যাপ করুন অথবা মাইকে দুবার ট্যাপ করে 'পে' বলুন।",
        "gu": "સુરક્ષિત ચેકઆઉટ. ચુકવણી કરવા માટે બટન ટેપ કરો અથવા માઇક પર બે વાર ટેપ કરીને 'પે' કહો.",
        "or": "ସୁରକ୍ଷିତ ଚେକଆଉଟ୍। ଦେୟ ପ୍ରଦାନ କରିବାକୁ ବଟନ୍ ଟ୍ୟାପ୍ କରନ୍ତୁ କିମ୍ବା ମାଇକ୍ ଉପରେ ଦୁଇଥର ଟ୍ୟାପ୍ କରି 'ଦେୟ' କୁହନ୍ତୁ।",
        "pa": "ਸੁਰੱਖਿਅਤ ਚੈੱਕਆਉਟ। ਭੁਗਤਾਨ ਕਰਨ ਲਈ ਬਟਨ ਟੈਪ ਕਰੋ ਜਾਂ ਮਾਈਕ 'ਤੇ ਦੋ ਵਾਰ ਟੈਪ ਕਰਕੇ 'ਭੁਗਤਾਨ' ਬੋਲੋ।"
    }
}

# English Status Translations for localized display
STATUS_TRANSLATIONS = {
    "interest_expressed": {
        "en": "Interest Expressed",
        "ta": "ஆர்வத்தை வெளிப்படுத்தியுள்ளார்",
        "hi": "रुचि व्यक्त की गई",
        "te": "ఆసక్తి వ్యక్తీకరించబడింది",
        "kn": "ಆಸಕ್ತಿ ವ್ಯಕ್ತಪಡಿಸಲಾಗಿದೆ",
        "ml": "താൽപ്പര്യം പ്രകടിപ്പിച്ചു",
        "mr": "रस दाखवला आहे",
        "bn": "আগ্রহ প্রকাশ করেছেন",
        "gu": "રસ દર્શાવ્યો",
        "or": "ଆଗ୍ରହ ପ୍ରକାଶିତ",
        "pa": "ਦਿਲਚਸਪੀ ਦਿਖਾਈ"
    },
    "invitation_accepted": {
        "en": "Invitation Accepted",
        "ta": "அழைப்பு ஏற்றுக்கொள்ளப்பட்டது",
        "hi": "निमंत्रण स्वीकार किया",
        "te": "ఆహ్వానం ఆమోదించబడింది",
        "kn": "ಆಹ್ವಾನ ಒಪ್ಪಿಕೊಳ್ಳಲಾಗಿದೆ",
        "ml": "ക്ഷണം സ്വീകരിച്ചു",
        "mr": "निमंत्रण स्वीकारले",
        "bn": "আমন্ত্রণ গৃহীত",
        "gu": "આમંત્રણ સ્વીકાર્યું",
        "or": "ନିମନ୍ତ୍ରଣ ଗୃହୀତ",
        "pa": "ਸੱਦਾ ਸਵੀਕਾਰਿਆ"
    },
    "payment_paid": {
        "en": "Payment Paid",
        "ta": "பணம் செலுத்தப்பட்டது",
        "hi": "भुगतान पूरा हुआ",
        "te": "చెల్లింపు పూర్తయింది",
        "kn": "ಪಾವತಿ ಮಾಡಲಾಗಿದೆ",
        "ml": "പണമടച്ചു",
        "mr": "पेमेंट पूर्ण",
        "bn": "টাকা প্রদান সম্পন্ন",
        "gu": "ચુકવણી પૂર્ણ થઈ",
        "or": "ଦେୟ ପ୍ରଦାନ ଶେଷ",
        "pa": "ਭੁਗਤਾਨ ਹੋ ਗਿਆ"
    },
    "order_confirmed": {
        "en": "Order Confirmed",
        "ta": "ஆர்டர் உறுதி செய்யப்பட்டது",
        "hi": "ऑर्डर कन्फर्म हुआ",
        "te": "ఆర్డర్ నిర్ధారించబడింది",
        "kn": "ಆರ್ಡರ್ ದೃಢೀಕರಿಸಲಾಗಿದೆ",
        "ml": "ഓർഡർ സ്ഥിരീകരിച്ചു",
        "mr": "ऑर्डर कन्फर्म",
        "bn": "অর্ডার নিশ্চিত হয়েছে",
        "gu": "ઓર્ડર કન્ફર્મ થયો",
        "or": "ଅର୍ଡର ନିଶ୍ଚିତ",
        "pa": "ਆਰਡਰ ਪੱਕਾ ਹੋਇਆ"
    },
    "processing": {
        "en": "Processing",
        "ta": "செயலாக்கத்தில் உள்ளது",
        "hi": "प्रक्रिया जारी है",
        "te": "ప్రాసెసింగ్ జరుగుతోంది",
        "kn": "ಪ್ರಕ್ರಿಯೆಯಲ್ಲಿದೆ",
        "ml": "പ്രോസസ്സിംഗിലാണ്",
        "mr": "प्रक्रियेत आहे",
        "bn": "প্রক্রিয়াকরণ চলছে",
        "gu": "પ્રક્રિયા હેઠળ છે",
        "or": "ପ୍ରକ୍ରିୟାକରଣ ଚାଲିଛି",
        "pa": "ਪ੍ਰਕਿਰਿਆ ਵਿੱਚ ਹੈ"
    }
}

def get_lang_prefix(lang_code: Optional[str]) -> str:
    """Extract primary 2-letter language code from BCP-47 tag."""
    if not lang_code:
        return "en"
    return lang_code.split("-")[0].lower()

def get_localized_prompt(key: str, lang_code: Optional[str], **kwargs) -> str:
    """
    Returns localized text for a pre-defined prompt key.
    Falls back to English if the specific language translation is missing.
    """
    prefix = get_lang_prefix(lang_code)
    prompt_entry = LOCALIZED_PROMPTS.get(key, {})
    template = prompt_entry.get(prefix) or prompt_entry.get("en", "")
    
    if not template and key in LOCALIZED_PROMPTS:
        template = LOCALIZED_PROMPTS[key].get("en", "")
        
    try:
        return template.format(**kwargs) if template else key
    except Exception:
        return template

def get_localized_status(status_english: str, lang_code: Optional[str]) -> str:
    """
    Translates an English SQLite status (e.g. 'interest_expressed')
    into the user's localized native language string for UI rendering.
    """
    prefix = get_lang_prefix(lang_code)
    status_entry = STATUS_TRANSLATIONS.get(status_english, {})
    return status_entry.get(prefix) or status_entry.get("en", status_english.replace("_", " ").title())

def translate_dynamic_text(text: str, target_lang_code: Optional[str]) -> str:
    """
    Translates arbitrary dynamic text into target language using Groq LLM (openai/gpt-oss-20b).
    Preserves numbers, symbols, and names accurately.
    """
    if not text or not text.strip():
        return text
        
    prefix = get_lang_prefix(target_lang_code)
    if prefix == "en":
        return text
        
    target_lang_name = SUPPORTED_LANGUAGES.get(target_lang_code or prefix, "Tamil")
    
    prompt = f"""
    Translate the following text into {target_lang_name}.
    Maintain exact numbers, currency amounts, and proper names without alteration.
    Return ONLY a JSON object: {{"translated_text": "YOUR_TRANSLATION"}}
    
    Text to translate: "{text}"
    """
    try:
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="openai/gpt-oss-20b",
            response_format={"type": "json_object"}
        )
        data = json.loads(completion.choices[0].message.content)
        return data.get("translated_text", text)
    except Exception as e:
        logger.error(f"Dynamic translation failed for '{text}' to {target_lang_name}: {e}")
        return text

def translate_to_english(text: str) -> str:
    """
    Translates or maps regional language voice input back to standard English tokens
    prior to writing to the SQLite database.
    Ensures all database rows, titles, and entries remain strictly in English.
    """
    if not text or not text.strip():
        return text
        
    # Pre-compiled high-frequency agricultural commodity mapping for sub-millisecond response
    COMMON_COMMODITY_MAP = {
        "மலைத்தேன்": "Wild Forest Honey",
        "தேன்": "Honey",
        "மஞ்சள்": "Organic Turmeric",
        "மிளகு": "Black Pepper",
        "ஏலக்காய்": "Cardamom",
        "காப்பி": "Coffee Beans",
        "கோதுமை": "Wheat",
        "அரிசி": "Rice",
        "சீரகம்": "Cumin",
        "கடுகு": "Mustard",
        "இஞ்சி": "Ginger",
        "பூண்டு": "Garlic",
        "வெங்காயம்": "Onion",
        "தக்காளி": "Tomato",
        "शहद": "Honey",
        "हल्दी": "Organic Turmeric",
        "काली मिर्च": "Black Pepper",
        "इलायची": "Cardamom",
        "कॉफी": "Coffee Beans",
        "गेहूं": "Wheat",
        "चावल": "Rice",
        "తేనె": "Honey",
        "పసుపు": "Organic Turmeric",
        "மஞ்சள் கிழங்கு": "Raw Turmeric Rhizome"
    }
    
    clean_text = text.strip()
    if clean_text in COMMON_COMMODITY_MAP:
        return COMMON_COMMODITY_MAP[clean_text]
        
    prompt = f"""
    The user is an Indian tribal farmer stating a product or voice term in a regional language: "{clean_text}".
    Translate this into a clean, concise, standard English product title.
    Return ONLY a JSON object: {{"english_text": "Standard English Title"}}
    """
    try:
        completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="openai/gpt-oss-20b",
            response_format={"type": "json_object"}
        )
        data = json.loads(completion.choices[0].message.content)
        return data.get("english_text", clean_text)
    except Exception as e:
        logger.error(f"Translation to English failed for '{clean_text}': {e}")
        return clean_text

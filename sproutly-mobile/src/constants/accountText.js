// The words on the Privacy, Terms, Help and About screens, kept in one place so they can be
// reviewed together. They describe what the app and backend actually do (checked 29 Oct 2026):
// change them whenever that changes.
import Constants from 'expo-constants';

// Questions about personal data, and deletion requests from people without the app, go here.
// The same address is on the public pages (portal /privacy and /delete-account).
export const CONTACT_EMAIL = 'sproutly.ke.support@gmail.com';

export const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

export const PAGES = {
    privacy: {
        title: 'Privacy policy',
        intro: 'Sproutly is a student research prototype (Strathmore University, 2026). This page says what it keeps about you, who can see it, for how long, and how to remove it.',
        sections: [
            ['What Sproutly keeps', [
                'Your phone number or email, and the county you choose.',
                'If you tap "Use my location": your phone\'s position is used once to find your county and is not kept. Only the county is saved.',
                'Your password, stored only in scrambled form (a hash): nobody can read it, including us.',
                'The key of your authenticator app, stored encrypted.',
                'The leaf photos you check, made smaller and with location (GPS) details removed, plus any description you type.',
                "Each check's result: the disease, how sure Sproutly was, and any reply from an extension officer.",
                'The questions you ask about a result and the replies you were shown, only if you chose "Keep them". You can turn this off at any time.',
                'If you use Continue with Google: the email and account number Google gives us. Never your Google password.',
            ]],
            ['Why', [
                'To check your leaf photos and show you the result.',
                'To send a case to an extension officer in your county, only when you tick that box.',
                'To show the support contacts for your county.',
                'To keep your account safe.',
                'To let you read your questions about a result again, if you chose to keep them.',
            ]],
            ['Who can see it', [
                'You.',
                "Extension officers in your county, only for cases you chose to send. They see your phone number only if you also ticked \"The officer may phone me\".",
                'The Sproutly administrators, to run and check the service.',
                'If you use "Ask about this result": your question and the result (never your name, number or photo) go to Groq, an AI service in the United States, which only chooses which of the Sproutly advice to show. Groq does not keep them.',
                'Questions you chose to keep are shown only to you, never to extension officers.',
                'Nobody else. Your data is not sold, and your photos are not used to train the model.',
            ]],
            ['How long', [
                'Photos are deleted 30 days after the check. The result and any officer\'s reply stay in "Your checks".',
                'Questions you chose to keep stay with their check until you delete them: Account, then Delete my saved questions. Turning "Keep my assistant questions" off stops new ones being kept.',
                'Everything else is kept while you have an account.',
                'When you delete your account, your photos, checks, cases, saved questions and account are deleted at once. Only a record that "an account was deleted" and when stays, with nothing that identifies you.',
            ]],
            ['Your rights', [
                "Under Kenya's Data Protection Act (2019) you can see, correct and delete your data.",
                'To delete everything: Account, then Delete my account.',
                'No longer have the app? Email sproutly.ke.support@gmail.com from the email or phone number on your account, and everything is deleted within 7 days.',
            ]],
            ['Security', [
                'Signing in needs your password and a code from your authenticator app.',
                'Only your newest sign-in stays active: signing in on another phone signs the old one out.',
            ]],
        ],
    },
    terms: {
        title: 'Terms of use',
        intro: 'By using Sproutly you agree to these terms. Sproutly is a student research prototype and is offered free of charge.',
        sections: [
            ['What Sproutly is', [
                'Sproutly suggests which disease a maize, tomato or potato leaf may have. It is a guide, not a guarantee.',
                'When Sproutly is not sure, it says so. Ask an extension officer or your county agriculture office before acting.',
                'Before using any chemical, follow the product label and the advice of an extension officer or agrovet.',
            ]],
            ['Your part', [
                'Keep your password, authenticator app and backup codes private.',
                'Send photos of crop leaves only. Do not send photos of people.',
                'Do not try to break, overload or misuse the service.',
            ]],
            ['Your account', [
                'You can delete your account at any time in the app.',
                'An account that misuses the service may be turned off.',
            ]],
            ['Limits', [
                'Sproutly is provided as it is, without a promise that it is always right or always available.',
                'Sproutly is not responsible for losses from decisions made only on its suggestions.',
                'These terms follow the laws of Kenya.',
            ]],
        ],
    },
    help: {
        title: 'Help',
        intro: 'How to get the best result, and answers to common questions.',
        sections: [
            ['Taking a good leaf photo', [
                'One leaf fills most of the photo.',
                'Daylight, without strong shadows or flash.',
                'Hold the phone still so the photo is sharp. Tap the leaf on the screen to focus.',
                'Show the spots or marks clearly. If both sides of the leaf look different, check both.',
                'Choose the right crop. If you are not sure, choose "Not sure / mixed".',
            ]],
            ['Why does Sproutly say "not sure"?', [
                'It only names a disease when it is confident enough. A wrong answer could make you treat the wrong disease, so when the photo is unclear or unfamiliar it asks a person instead.',
            ]],
            ['What happens when I send a case to an officer?', [
                'An extension officer in your county looks at the photo, usually within 7 days, and replies. The reply appears under "Your checks".',
                'If nobody replies in time, Sproutly shows you the support contacts for your county.',
            ]],
            ['I lost my phone', [
                'Sign in on another phone with your password and a backup code. Your lost phone is then signed out.',
                'Then go to Account, then Authenticator on a new phone.',
            ]],
            ['Which crops can Sproutly check?', [
                'Diseases of maize, tomato and potato. Pests, soil problems and other crops need local support, such as your county agriculture office or an agrovet.',
            ]],
        ],
    },
    about: {
        title: 'About Sproutly',
        intro: 'Crop disease checks that know when they are not sure, with expert referral for smallholder farmers in Kenya.',
        sections: [
            ['What Sproutly can check', [
                'Diseases of maize, tomato and potato. Anything else, including pests and soil problems, needs local support such as your county agriculture office or an agrovet.',
            ]],
            ['How it decides', [
                'Three image models (ResNet-50, ConvNeXt-Tiny and EfficientNet-B0) look at the photo and their answers are combined. The combined confidence is calibrated on field photos the models never trained on.',
                'Below 96% confidence it does not guess: the case can go to an extension officer instead. In testing on new field photos, the answers it did give were right 99.8% of the time.',
            ]],
            ['Data used to build the model', [
                'PlantVillage, FieldPlant, a Tanzanian potato field dataset and openly licensed (CC BY 4.0) field photo collections from Mendeley Data and the University of Pretoria. Advice in replies comes from cited sources.',
            ]],
            ['Made by', [
                'Mwangi Billiart B. Muthoni, BSc Informatics and Computer Science, Strathmore University, 2026.',
            ]],
        ],
    },
};

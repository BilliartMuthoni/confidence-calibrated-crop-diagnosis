import PublicPage, { CONTACT_EMAIL, Section } from '../components/PublicPage.jsx'

// The app's privacy policy (sproutly-mobile/src/constants/accountText.js), public for Google Play.
// Keep the two in step: change both whenever what the app or backend keeps changes.
export default function PrivacyPage() {
  return (
    <PublicPage
      title="Privacy policy"
      updated="29 October 2026"
      intro="Sproutly is a student research prototype (Strathmore University, 2026). This page says what it keeps about you, who can see it, for how long, and how to remove it."
    >
      <Section title="What Sproutly keeps" items={[
        'Your phone number or email, and the county you choose.',
        'If you tap "Use my location": your phone\'s position is used once to find your county and is not kept. Only the county is saved.',
        'Your password, stored only in scrambled form (a hash): nobody can read it, including us.',
        'The key of your authenticator app, stored encrypted.',
        'The leaf photos you check, made smaller and with location (GPS) details removed, plus any description you type.',
        "Each check's result: the disease, how sure Sproutly was, and any reply from an extension officer.",
        'The questions you ask about a result and the replies you were shown, only if you chose "Keep them". You can turn this off at any time.',
        'If you use Continue with Google: the email and account number Google gives us. Never your Google password.',
      ]} />
      <Section title="Why" items={[
        'To check your leaf photos and show you the result.',
        'To send a case to an extension officer in your county, only when you tick that box.',
        'To show the support contacts for your county.',
        'To keep your account safe.',
        'To let you read your questions about a result again, if you chose to keep them.',
      ]} />
      <Section title="Who can see it" items={[
        'You.',
        'Extension officers in your county, only for cases you chose to send. They see your phone number only if you also ticked "The officer may phone me".',
        'The Sproutly administrators, to run and check the service.',
        'If you use "Ask about this result": your question and the result (never your name, number or photo) go to Groq, an AI service in the United States, which only chooses which of the Sproutly advice to show. Groq does not keep them.',
        'Questions you chose to keep are shown only to you, never to extension officers.',
        'Nobody else. Your data is not sold, and your photos are not used to train the model.',
      ]} />
      <Section title="How long" items={[
        'Photos are deleted 30 days after the check. The result and any officer\'s reply stay in "Your checks".',
        'Questions you chose to keep stay with their check until you delete them.',
        'Everything else is kept while you have an account.',
        'When you delete your account, your photos, checks, cases, saved questions and account are deleted at once. Only a record that "an account was deleted" and when stays, with nothing that identifies you.',
      ]} />
      <Section title="Your rights" items={[
        "Under Kenya's Data Protection Act (2019) you can see, correct and delete your data.",
        'To delete everything in the app: Account, then Delete my account.',
        `No longer have the app? Email ${CONTACT_EMAIL} from the email or phone number on your account, and everything is deleted within 7 days.`,
      ]} />
      <Section title="Security" items={[
        'Signing in needs your password and a code from your authenticator app.',
        'Only your newest sign-in stays active: signing in on another phone signs the old one out.',
      ]} />
      <Section title="Contact">
        <p className="mt-3 text-base leading-7 text-body">
          Questions about your data: <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary underline">{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </PublicPage>
  )
}

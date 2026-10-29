import PublicPage, { CONTACT_EMAIL, Section } from '../components/PublicPage.jsx'

// How to delete a Sproutly account, with or without the app (Google Play needs this public link).
// What it lists matches the backend's account deletion (POST /auth/me/delete).
export default function DeleteAccountPage() {
  const subject = encodeURIComponent('Delete my Sproutly account')
  return (
    <PublicPage
      title="Delete your Sproutly account"
      intro="You can delete your Sproutly account and its data at any time, from the app or by email."
    >
      <Section title="In the app (fastest)">
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-base leading-7 text-body">
          <li>Open Sproutly and go to <strong>Account</strong>.</li>
          <li>Tap <strong>Delete my account</strong>.</li>
          <li>Confirm with your password and authenticator code, or continue with Google if you signed up with Google.</li>
        </ol>
        <p className="mt-3 text-base leading-7 text-body">Everything is deleted at once.</p>
      </Section>

      <Section title="Without the app">
        <p className="mt-3 text-base leading-7 text-body">
          Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}?subject=${subject}`} className="font-semibold text-primary underline">{CONTACT_EMAIL}</a>{' '}
          with the subject "Delete my Sproutly account", from the email address on your account, or include the phone
          number you signed up with. We may ask you to confirm it is your account, then delete everything within 7 days
          and reply to say it is done.
        </p>
      </Section>

      <Section title="What is deleted" items={[
        'Your account: phone number or email, county, password and authenticator key.',
        'Your leaf photos and every check, with its result and description.',
        'Cases you sent to an extension officer, and their replies.',
        'Questions you kept from "Ask about this result".',
        'Your backup codes and sign-in records.',
      ]} />

      <Section title="What is kept" items={[
        'Only a record that "an account was deleted" and when, with nothing that identifies you. It shows the service was run correctly.',
      ]} />
    </PublicPage>
  )
}

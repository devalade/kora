import { createFileRoute } from '@tanstack/react-router';
import { LEGAL_CONTACT, LegalPage, LegalSection } from '../components/legal-page';

export const Route = createFileRoute('/privacy')({
  head: () => ({ meta: [{ title: 'Privacy · Kora' }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="This page lists what Kora stores about you, why, who else handles it, and how to get it removed. We collect what the product needs and little else."
    >
      <LegalSection title="What we store">
        <ul>
          <li>
            <strong>Account:</strong> your name, email, role title, status, profile photo, and a salted hash of your
            password (never the password itself).
          </li>
          <li>
            <strong>Workspace content:</strong> messages, threads, reactions, files, channels, issues, comments and
            their history. Only people in the same workspace can see them, and private channels and DMs only their
            members.
          </li>
          <li>
            <strong>Activity:</strong> when you were last online, which channels you have read, and your inbox of
            mentions and issue updates.
          </li>
          <li>
            <strong>Security records:</strong> your IP address, kept briefly with failed sign-ins and password reset
            requests to stop guessing and abuse, and deleted once the limit window ends.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cookies and analytics">
        <p>
          Kora sets one cookie to keep you signed in. We use PostHog to count page views and product events (such as
          “a message was sent”) and to report errors, so we know what to fix. Analytics identify you only by an
          internal id, mask the text on screen, and never record your session or read your messages.
        </p>
        <p>
          Desktop notifications, drafts and recent emoji are kept in your own browser and never leave it.
        </p>
      </LegalSection>

      <LegalSection title="Who handles your data">
        <ul>
          <li>
            <strong>Cloudflare</strong> runs Kora and stores its database and files, and sends our emails.
          </li>
          <li>
            <strong>PostHog</strong> processes product analytics and error reports.
          </li>
        </ul>
        <p>
          We do not sell personal data, show ads, or share your content with anyone outside your workspace. If you
          link a page in chat, Kora fetches that page to show a preview, without passing on who you are.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <ul>
          <li>Deleted messages lose their text and files at once.</li>
          <li>Deleted issues stay in Trash for 30 days so they can be restored, then they are gone.</li>
          <li>Read inbox items are removed after 90 days.</li>
          <li>Password reset links expire after one hour and work once.</li>
          <li>Everything else stays while your account or workspace exists.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Your choices">
        <p>
          You can change your profile and password, remove your photo, sign out of every device, and leave any
          workspace from the app. To get a copy of your data, correct it, or delete your account, write to{' '}
          {LEGAL_CONTACT} from the email you sign in with. We answer within 30 days.
        </p>
        <p>
          Messages you posted in a workspace also belong to that workspace's conversation. When you delete your
          account, they are removed or shown without your name.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

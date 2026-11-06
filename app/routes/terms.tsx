import { createFileRoute } from '@tanstack/react-router';
import { LEGAL_CONTACT, LegalPage, LegalSection } from '../components/legal-page';

export const Route = createFileRoute('/terms')({
  head: () => ({ meta: [{ title: 'Terms · Kora' }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro="Kora is team chat with tasks. These terms explain what you can expect from us and what we expect from you when you use it. They are short on purpose."
    >
      <LegalSection title="Your account">
        <p>
          You need an account to use Kora. Keep your password private and tell us at {LEGAL_CONTACT} if you think someone
          else has used your account. You are responsible for what happens under it.
        </p>
        <p>You must be old enough to agree to these terms where you live, and at least 16.</p>
      </LegalSection>

      <LegalSection title="Workspaces">
        <p>
          The person who creates a workspace owns it. Owners and admins decide who joins, can remove people, and can
          delete messages and issues in their workspace. Anyone with a workspace's invite link can join it, so share it
          with care and reset it from Invite people if it leaks.
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          Messages, files, issues and comments you post stay yours. You give us permission to store, process and show
          them to the people in your workspace, only so Kora works. We do not sell your content or use it to train
          models.
        </p>
        <p>Do not post anything you do not have the right to share.</p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <ul>
          <li>No spam, harassment, or content that is illegal where you or we are.</li>
          <li>No malware, and no attempts to break into accounts, workspaces or our systems.</li>
          <li>No automated use that floods Kora. Agents connected through MCP act as you and follow the same rules.</li>
        </ul>
        <p>We may limit or close accounts that break these rules, and remove content that does.</p>
      </LegalSection>

      <LegalSection title="The service">
        <p>
          Kora is provided as it is. We work to keep it fast and available, but we cannot promise it will never be down
          or lose data, so keep copies of anything critical. Files are limited to 25 MB each and 500 MB per person.
        </p>
        <p>
          We may change features or these terms. When a change matters, we will say so in the app or by email before it
          applies.
        </p>
      </LegalSection>

      <LegalSection title="Leaving">
        <p>
          You can leave a workspace at any time from Workspace settings. To delete your account and everything that is
          only yours, write to {LEGAL_CONTACT} from the email you sign in with.
        </p>
      </LegalSection>

      <LegalSection title="Liability">
        <p>
          To the extent the law allows, we are not liable for indirect or lost-profit damages from using Kora. Nothing
          here limits rights you have under the law that cannot be waived.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

// Build-time settings for the public pages. The defaults describe the official
// instance; a self-hosted build overrides them with VITE_* env vars (see
// docs/self-hosting.md). An empty variable falls back to the default.

/** Where the source code lives. */
export const REPO_URL: string = import.meta.env.VITE_REPO_URL || 'https://github.com/Eric-kbo/AicialNote'

/** The host shown in the privacy policy and terms, e.g. "notes.example.com". */
export const SITE_HOST: string = import.meta.env.VITE_SITE_HOST || 'aicialnotes.com'

/** The contact address shown in the privacy policy and terms. */
export const CONTACT_EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL || 'support@aicialnotes.com'

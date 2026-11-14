import de from './de'
import es from './es'
import fr from './fr'
import id from './id'
import it from './it'
import ja from './ja'
import ko from './ko'
import ptBR from './pt-BR'
import ru from './ru'
import tr from './tr'
import vi from './vi'
import zhHant from './zh-Hant'

/**
 * Translations of the strings AicialNote writes into the user's drive (field labels, card names, status labels,
 * readable-copy headings) for languages other than zh and en, keyed by language tag and then by the English text.
 * `pick` looks values up here. These labels are copied into a vault when it is created or a card is added, so a
 * later change to a translation doesn't reach existing vaults (decisions D16, D17). Path names are never translated
 * here: see `pickPath`. A language goes into `EXTRA` (web/src/i18n/languages.ts) only together with its table here.
 */
export const DRIVE_TRANSLATIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'zh-Hant': zhHant,
  ja,
  ko,
  es,
  fr,
  de,
  'pt-BR': ptBR,
  it,
  ru,
  tr,
  vi,
  id,
}

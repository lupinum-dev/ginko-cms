import { useCmsI18n } from '../../composables/useCmsI18n'

export function useEditorI18n() {
  const { t } = useCmsI18n()

  return {
    $t: t,
    t,
  }
}

import i18n from '../i18n'
import { useNotificationsStore, type NoticeKind } from '../store/notifications'

interface TranslatedNoticeOptions {
  messageKey?: string
  values?: Record<string, string | number>
  timeoutMs?: number
}

export function pushTranslatedNotice(
  kind: NoticeKind,
  titleKey: string,
  { messageKey, values, timeoutMs }: TranslatedNoticeOptions = {}
): string {
  return useNotificationsStore.getState().pushNotice({
    kind,
    title: i18n.t(titleKey, values),
    message: messageKey ? i18n.t(messageKey, values) : undefined,
    timeoutMs,
  })
}

export function pushErrorNotice(
  titleKey: string,
  messageKey: string,
  options?: Omit<TranslatedNoticeOptions, 'messageKey'>
): string {
  return pushTranslatedNotice('error', titleKey, { ...options, messageKey })
}

export function pushInfoNotice(
  titleKey: string,
  messageKey?: string,
  options?: Omit<TranslatedNoticeOptions, 'messageKey'>
): string {
  return pushTranslatedNotice('info', titleKey, { ...options, messageKey })
}

export function pushSuccessNotice(
  titleKey: string,
  messageKey?: string,
  options?: Omit<TranslatedNoticeOptions, 'messageKey'>
): string {
  return pushTranslatedNotice('success', titleKey, { ...options, messageKey })
}

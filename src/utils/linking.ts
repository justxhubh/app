import { Linking } from 'react-native';

export function openWhatsApp(phone: string, message?: string): void {
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  Linking.openURL(`https://wa.me/91${phone.replace(/\D/g, '')}${text}`).catch(() => {});
}

export function openCall(phone: string): void {
  Linking.openURL(`tel:+91${phone.replace(/\D/g, '')}`).catch(() => {});
}

// lib/locations.ts
// Maps user-facing country/language to DataForSEO location_code & language_code.
// Full list: https://docs.dataforseo.com/v3/serp/google/locations/

export interface LocationOption {
  country: string;
  countryCode: string;
  locationCode: number; // DataForSEO location_code
}

export const COUNTRIES: LocationOption[] = [
  { country: "Kenya", countryCode: "KE", locationCode: 2404 },
  { country: "United States", countryCode: "US", locationCode: 2840 },
  { country: "United Kingdom", countryCode: "GB", locationCode: 2826 },
  { country: "Nigeria", countryCode: "NG", locationCode: 2566 },
  { country: "South Africa", countryCode: "ZA", locationCode: 2710 },
  { country: "Ghana", countryCode: "GH", locationCode: 2288 },
  { country: "Tanzania", countryCode: "TZ", locationCode: 2834 },
  { country: "Uganda", countryCode: "UG", locationCode: 2800 },
  { country: "Canada", countryCode: "CA", locationCode: 2124 },
  { country: "Australia", countryCode: "AU", locationCode: 2036 },
  { country: "India", countryCode: "IN", locationCode: 2356 },
  { country: "Germany", countryCode: "DE", locationCode: 2276 },
  { country: "France", countryCode: "FR", locationCode: 2250 },
  { country: "United Arab Emirates", countryCode: "AE", locationCode: 2784 },
];

export interface LanguageOption {
  language: string;
  languageCode: string; // DataForSEO language_code
}

export const LANGUAGES: LanguageOption[] = [
  { language: "English", languageCode: "en" },
  { language: "Swahili", languageCode: "sw" },
  { language: "French", languageCode: "fr" },
  { language: "German", languageCode: "de" },
  { language: "Arabic", languageCode: "ar" },
  { language: "Spanish", languageCode: "es" },
  { language: "Portuguese", languageCode: "pt" },
];

export function resolveLocation(country: string): LocationOption {
  return COUNTRIES.find((c) => c.country === country) ?? COUNTRIES[0];
}
export function resolveLanguage(language: string): LanguageOption {
  return LANGUAGES.find((l) => l.language === language) ?? LANGUAGES[0];
}

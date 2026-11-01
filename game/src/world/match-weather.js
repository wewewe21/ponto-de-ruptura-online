// Match IDs travel over the network; every client resolves the same lighting palette.
const preset = (p) => Object.freeze(p);
export const MATCH_WEATHER = Object.freeze({
  day_clear: preset({ name: 'Dia aberto', rain: 0, lightning: false, cloudAmount: 0.18, skyLow: 0xb1d0df, skyHigh: 0x3989c3, cloud: 0xe7edf0, fog: 0xc0d4dd, fogDensity: 0.0026, hemi: 2.8, hemiSky: 0xc2e0ff, ground: 0x777b65, sun: 3.4, sunColor: 0xffefd0, sunHeight: 0.78, environment: 1.15 }),
  day_cloudy: preset({ name: 'Dia nublado', rain: 0, lightning: false, cloudAmount: 0.88, skyLow: 0xb8c6cc, skyHigh: 0x69889e, cloud: 0xd2d9dd, fog: 0xb3c2c8, fogDensity: 0.004, hemi: 2.7, hemiSky: 0xc5d5df, ground: 0x72776a, sun: 1.1, sunColor: 0xe8eef2, sunHeight: 0.78, environment: 1.05 }),
  sunset: preset({ name: 'Entardecer', rain: 0, lightning: false, cloudAmount: 0.5, skyLow: 0xf0a46d, skyHigh: 0x536999, cloud: 0xbba4b1, fog: 0xc39982, fogDensity: 0.0048, hemi: 2.0, hemiSky: 0xb5bddd, ground: 0x75634f, sun: 2.5, sunColor: 0xffa65e, sunHeight: 0.14, environment: 0.85 }),
  rain: preset({ name: 'Chuva leve', rain: 0.24, lightning: false, cloudAmount: 1, skyLow: 0x82939c, skyHigh: 0x465e70, cloud: 0x98a6b0, fog: 0x8c9ea8, fogDensity: 0.007, hemi: 2.2, hemiSky: 0xa9c2d4, ground: 0x626c64, sun: 0.7, sunColor: 0xc7d8e3, sunHeight: 0.78, environment: 0.9 }),
});

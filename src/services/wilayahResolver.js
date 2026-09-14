import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DATA_PATH = path.join(__dirname, 'data', 'regency_adm4.json');

let regencyDataset = [];
try {
  if (fs.existsSync(LOCAL_DATA_PATH)) {
    regencyDataset = JSON.parse(fs.readFileSync(LOCAL_DATA_PATH, 'utf8'));
  }
} catch (e) {
  console.error("Failed to load local regency_adm4.json:", e);
}

function cleanStr(s = '') {
  return String(s)
    .toLowerCase()
    .replace(/^(kota|kabupaten|kab\.|provinsi|prov\.|kecamatan|kec\.|desa|kelurahan|kel\.)\s+/i, '')
    .trim();
}

/**
 * Cari wilayah administratif berdasarkan keyword nama kota/kabupaten/daerah
 */
export function searchWilayah(query, limit = 5) {
  if (!query) return [];
  const rawQ = query.trim();

  // Jika input sudah berbentuk format kode ADM4 (xx.xx.xx.xxxx)
  if (/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(rawQ)) {
    return [{
      adm4: rawQ,
      nama: rawQ,
      detail: `Kode ADM4: ${rawQ}`
    }];
  }

  const tokens = rawQ.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').split(/\s+/).filter(t => t.length >= 3);

  // Scoring match di tingkat Kabupaten/Kota
  const scored = regencyDataset.map(r => {
    let score = 0;
    const regClean = r.reg_name.toLowerCase().replace(/^(kabupaten|kota)\s+/i, '');
    const fullLower = r.full_name.toLowerCase();

    for (const token of tokens) {
      if (regClean === token) {
        score += 100;
      } else if (regClean.includes(token)) {
        score += Math.round(50 * (token.length / regClean.length));
      }
      if (fullLower.includes(token)) {
        score += 20;
      }
    }
    return { r, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(x => ({
    adm4: x.r.adm4,
    nama: x.r.reg_name,
    detail: x.r.full_name,
    lokasi: {
      provinsi: x.r.prov_name,
      kota: x.r.reg_name,
      kecamatan: x.r.dist_name,
      desa: x.r.vil_name
    }
  }));
}

/**
 * Resolve lokasi string menjadi satu kode adm4 terbaik (dengan drill-down kecamatan & desa)
 */
export async function resolveLocationToAdm4(input) {
  if (!input) return null;
  const rawQ = input.trim();
  if (/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(rawQ)) {
    return { adm4: rawQ, detail: rawQ };
  }

  const tokens = rawQ.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').split(/\s+/).filter(t => t.length >= 3);

  // 1. Scoring match di tingkat Kabupaten/Kota
  const scored = regencyDataset.map(r => {
    let score = 0;
    const regClean = r.reg_name.toLowerCase().replace(/^(kabupaten|kota)\s+/i, '');
    const fullLower = r.full_name.toLowerCase();

    for (const token of tokens) {
      if (regClean === token) {
        score += 100;
      } else if (regClean.includes(token)) {
        score += Math.round(50 * (token.length / regClean.length));
      }
      if (fullLower.includes(token)) {
        score += 20;
      }
    }
    return { r, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      adm4: '31.71.01.1001',
      nama: 'Gambir',
      detail: 'Gambir, Kec. Gambir, Kota Administrasi Jakarta Pusat, DKI Jakarta',
      lokasi: {
        provinsi: 'DKI Jakarta',
        kota: 'Kota Administrasi Jakarta Pusat',
        kecamatan: 'Gambir',
        desa: 'Gambir'
      }
    };
  }

  const bestReg = scored[0].r;

  // 2. Cek apakah ada kecamatan & desa spesifik jika input memiliki token tambahan
  try {
    const specificTokens = tokens.filter(t => !bestReg.reg_name.toLowerCase().includes(t));
    if (specificTokens.length > 0) {
      const distRes = await axios.get(`https://wilayah.id/api/districts/${bestReg.reg_code}.json`, { timeout: 3000 });
      const districts = distRes.data?.data || [];

      let matchedDist = null;
      for (const d of districts) {
        const dName = d.name.toLowerCase();
        if (specificTokens.some(t => dName === t || dName.includes(t) || t.includes(dName))) {
          matchedDist = d;
          break;
        }
      }

      if (matchedDist) {
        const vilRes = await axios.get(`https://wilayah.id/api/villages/${matchedDist.code}.json`, { timeout: 3000 });
        const villages = vilRes.data?.data || [];
        let matchedVil = villages.find(v => {
          const vName = v.name.toLowerCase();
          return specificTokens.some(t => vName === t || vName.includes(t) || t.includes(vName));
        });

        if (!matchedVil && villages.length > 0) matchedVil = villages[0];

        if (matchedVil) {
          return {
            adm4: matchedVil.code,
            nama: bestReg.reg_name,
            detail: `${matchedVil.name}, Kec. ${matchedDist.name}, ${bestReg.reg_name}, ${bestReg.prov_name}`,
            lokasi: {
              provinsi: bestReg.prov_name,
              kota: bestReg.reg_name,
              kecamatan: matchedDist.name,
              desa: matchedVil.name
            }
          };
        }
      }
    }
  } catch (e) {
    // Abaikan error remote dan gunakan data default kabupaten
  }

  return {
    adm4: bestReg.adm4,
    nama: bestReg.reg_name,
    detail: bestReg.full_name,
    lokasi: {
      provinsi: bestReg.prov_name,
      kota: bestReg.reg_name,
      kecamatan: bestReg.dist_name,
      desa: bestReg.vil_name
    }
  };
}

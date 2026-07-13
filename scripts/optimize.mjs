import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const FONTS_DIR = path.join(ROOT_DIR, 'fonts');
const SCREENS_DIR = path.join(ROOT_DIR, 'screens');

// Configurações das fontes do Google
const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&family=DM+Sans:wght@400;500;600;700&display=swap';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function setupDependencies() {
  console.log('📦 Verificando dependências locais...');
  try {
    await import('sharp');
    console.log('✓ Sharp já está instalado.');
  } catch {
    console.log('Instalando biblioteca sharp... Isso pode levar alguns segundos.');
    try {
      execSync('npm install sharp --no-save', { cwd: ROOT_DIR, stdio: 'inherit' });
      console.log('✓ Sharp instalado com sucesso!');
    } catch (err) {
      console.error('⚠️ Falha ao instalar o sharp automaticamente. Por favor, instale executando: npm install sharp');
      process.exit(1);
    }
  }
}

async function processFonts() {
  console.log('\n🔤 Otimizando fontes...');
  if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
  }

  console.log('Buscando CSS de fontes da API do Google...');
  const css = await fetchText(GOOGLE_FONTS_URL, { 'User-Agent': USER_AGENT });

  // Regex para achar blocos de @font-face e links woff2
  const fontFaceRegex = /@font-face\s*\{[^}]*\}/g;
  const urlRegex = /url\((https:\/\/fonts\.gstatic\.com\/s\/[^)]+\.woff2)\)/;
  const familyRegex = /font-family:\s*['"]([^'"]+)['"]/;
  const weightRegex = /font-weight:\s*(\d+)/;
  const styleRegex = /font-style:\s*(\w+)/;

  const fontFaces = css.match(fontFaceRegex) || [];
  let localCssContent = '/* Fontes locais geradas pelo script de otimização */\n\n';
  let fontIndex = 1;

  for (const block of fontFaces) {
    const urlMatch = block.match(urlRegex);
    if (!urlMatch) continue;

    const fontUrl = urlMatch[1];
    const family = block.match(familyRegex)?.[1].replace(/\s+/g, '-').toLowerCase() || 'font';
    const weight = block.match(weightRegex)?.[1] || '400';
    const style = block.match(styleRegex)?.[1] || 'normal';

    const filename = `${family}-${weight}-${style}-${fontIndex++}.woff2`;
    const destPath = path.join(FONTS_DIR, filename);

    console.log(`Baixando: ${filename} de ${fontUrl}...`);
    try {
      await downloadFile(fontUrl, destPath);
      
      // Traduz o bloco de CSS para apontar localmente
      let localBlock = block
        .replace(fontUrl, `fonts/${filename}`)
        .replace(/font-display:\s*[^;]+;?/, '') // Remove se existir para padronizar
        .replace('src:', 'font-display: swap;\n  src:'); // Força font-display: swap
      
      localCssContent += localBlock + '\n\n';
    } catch (e) {
      console.error(`❌ Erro ao baixar fonte ${filename}:`, e.message);
    }
  }

  fs.writeFileSync(path.join(ROOT_DIR, 'fonts.css'), localCssContent);
  console.log('✓ Fontes baixadas e fonts.css gerado com sucesso!');
}

async function processImages() {
  console.log('\n🖼️ Otimizando e redimensionando imagens...');
  const { default: sharp } = await import('sharp');

  const imagesToProcess = [
    {
      src: path.join(SCREENS_DIR, 'app-canaleta.png'),
      dest: path.join(SCREENS_DIR, 'app-canaleta.webp'),
      width: 600,
    },
    {
      src: path.join(SCREENS_DIR, 'app-financas.png'),
      dest: path.join(SCREENS_DIR, 'app-financas.webp'),
      width: 600,
    },
    {
      src: path.join(ROOT_DIR, 'logoOficial.png'),
      dest: path.join(ROOT_DIR, 'logoOficial.webp'),
      width: 64,
      height: 64
    },
    {
      src: path.join(ROOT_DIR, 'logoOficial.png'),
      dest: path.join(ROOT_DIR, 'favicon-48.webp'),
      width: 48,
      height: 48
    }
  ];

  for (const img of imagesToProcess) {
    if (!fs.existsSync(img.src)) {
      console.warn(`⚠️ Arquivo de origem não encontrado: ${img.src}`);
      continue;
    }

    console.log(`Processando: ${path.basename(img.src)} -> ${path.basename(img.dest)}...`);
    try {
      const pipeline = sharp(img.src);
      
      if (img.width && img.height) {
        pipeline.resize(img.width, img.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
      } else if (img.width) {
        pipeline.resize({ width: img.width });
      }

      await pipeline
        .webp({ quality: 82 })
        .toFile(img.dest);

      console.log(`✓ Gerado com sucesso: ${path.basename(img.dest)} (${fs.statSync(img.dest).size} bytes)`);
    } catch (e) {
      console.error(`❌ Erro ao processar ${path.basename(img.src)}:`, e.message);
    }
  }
}

async function main() {
  console.log('🚀 === INICIANDO SCRIPT DE OTIMIZAÇÃO ===');
  await setupDependencies();
  await processFonts();
  await processImages();
  console.log('\n✨ === CONCLUÍDO! todos os assets locais foram otimizados ===');
  console.log('Agora você pode subir os novos arquivos gerados na pasta "fonts/" e "screens/" para o GitHub Pages.');
}

main().catch(console.error);

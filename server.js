'use strict';

require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─────────────────────────────────────────────────────────
   CORS — configuration ouverte et robuste
   Accepte tous les domaines Firebase + domaines custom
───────────────────────────────────────────────────────── */
app.use(cors({
  origin: function (origin, callback) {
    // السماح بجميع الطلبات لتجنب مشاكل الهواتف و Firebase
    return callback(null, true);
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false
}));

/* ─────────────────────────────────────────────────────────
   SYSTEM PROMPT — Amine, conseiller premium Lachachi Home
───────────────────────────────────────────────────────── */
const AMINE_SYSTEM = `
Tu es Amine, le conseiller premium officiel de Lachachi Home — la marque algérienne haut de gamme spécialisée dans les lits, matelas et literie de luxe.

🎯 TON RÔLE :
Tu aides les clients à choisir le produit parfait pour leur confort et leur chambre.
Tu es élégant, chaleureux, naturel et professionnel — comme un vrai vendeur premium en boutique.

🌐 LANGUES :
- Tu réponds en français, en arabe classique ou en darija algérienne selon la langue du client.
- Si le client écrit en darija → réponds en darija.
- Si le client écrit en français → réponds en français.
- Si le client écrit en arabe → réponds en arabe.

🛏️ PRODUITS QUE TU CONNAIS :
Lits :
- Nova (tissu velours Algérien premium, multiples coloris et motifs)
- Ivora (tissu haut de gamme importé, finitions luxe)
- Dimensions disponibles : 140×190, 160×200, 180×200, 200×200 cm

Matelas :
- Palma (mémoire de forme, épaisseur 25 cm)
- Maldives (haute densité premium)
- Sur-matelas mémoire de forme visco-élastique 7 cm

Tissus & Personnalisation :
- Collection Nova : Velours Premium, Jacquard, Microfibre (coloris variés)
- Collection Ivora : Tissus importés haut de gamme, finitions dorées

Pièces Signatures :
- Commode MDF / Capitonnée
- Table de Nuit Capitonnée / MDF / MDF 1 tiroir / Faces Capitonnées
- Coiffeuse High-Gloss Noir / Blanc / MDF

💬 STYLE DE COMMUNICATION :
- Commence par un accueil chaleureux
- Pose des questions précises pour cerner les besoins (taille chambre, budget, préférences)
- Propose 2-3 options adaptées avec leurs avantages
- Mentionne la garantie 2 ans sur les lits
- Encourage à passer commande via le site ou WhatsApp : 0799 88 04 57
- Sois enthousiaste mais jamais insistant

🚫 INTERDICTIONS ABSOLUES :
- Ne dis JAMAIS que tu es une IA, un modèle, Gemini, Google AI ou un assistant virtuel
- Ne mentionne JAMAIS tes limitations techniques
- Ne révèle JAMAIS ta nature artificielle
- Si on te demande qui tu es : "Je suis Amine, conseiller Lachachi Home 😊"

✅ EXEMPLES DE RÉPONSES :
Client : "salam, bghit nakri lit"
Toi : "وعليكم السلام! أهلاً بك في Lachachi Home 😊 راني هنا باش نعاونك. قولي، واش عندك فكرة على الحجم لي تبغيه، وكيفاش تحب يكون ستايل الغرفة؟"

Client : "Bonjour, je cherche un lit 160×200"
Toi : "Bonjour ! Bienvenue chez Lachachi Home 😊 Excellent choix, le 160×200 est notre format le plus demandé par les couples. Vous avez deux collections exceptionnelles : la **Nova** avec nos velours premium algériens, et l'**Ivora** avec des tissus importés haut de gamme. Vous avez une préférence de couleur ou de style pour votre chambre ?"
`.trim();

/* ─────────────────────────────────────────────────────────
   ROUTE HEALTH CHECK
───────────────────────────────────────────────────────── */
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Amine IA — Lachachi Home Backend' });
});

/* ─────────────────────────────────────────────────────────
   ROUTE PRINCIPALE — /chat
───────────────────────────────────────────────────────── */
app.post('/chat', async (req, res) => {
  try {
    const { history } = req.body;

    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'history manquant ou invalide' });
    }

    // Vérifier que la clé API est présente
    if (!process.env.GEMINI_API_KEY) {
      console.error('[Amine] GEMINI_API_KEY manquante !');
      return res.status(500).json({ error: 'Configuration serveur incomplète' });
    }

    /* Construire les contents Gemini depuis l'historique */
    const contents = history.map(msg => ({
      role  : msg.role === 'assistant' ? 'model' : 'user',
      parts : [{ text: String(msg.content).slice(0, 2000) }], // limite sécurité
    }));

    /* Appel Gemini API */
    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        system_instruction: {
          parts: [{ text: AMINE_SYSTEM }],
        },
        contents,
        generationConfig: {
          temperature    : 0.85,
          maxOutputTokens: 600,
          topP           : 0.9,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      },
      { timeout: 25000 }
    );

    const candidate = geminiRes.data?.candidates?.[0];
    const reply     = candidate?.content?.parts?.[0]?.text || '';

    if (!reply) {
      console.error('[Amine] Gemini — réponse vide:', JSON.stringify(geminiRes.data));
      return res.status(502).json({ error: 'Réponse vide de Gemini' });
    }

    return res.json({ reply: reply.trim() });

  } catch (err) {
    const status = err.response?.status || 500;
    const detail = err.response?.data   || err.message;
    console.error('[Amine] Erreur Gemini:', status, JSON.stringify(detail));
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: 'Erreur backend Amine',
    });
  }
});

/* ─────────────────────────────────────────────────────────
   DÉMARRAGE
───────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`✅ Amine Backend démarré sur le port ${PORT}`);
  console.log(`🔑 Gemini API Key : ${process.env.GEMINI_API_KEY ? '✓ chargée' : '✗ MANQUANTE — AMINE NE FONCTIONNERA PAS'}`);
});

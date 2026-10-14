// Suivi des mouvements de tête avec MediaPipe Face Landmarker (Tasks Vision), 100 % dans le navigateur :
// les images de la caméra ne quittent jamais l'appareil, seuls les gestes (oui / non / parler) sont émis.
//   tête tournée vers SA gauche = oui · vers SA droite = non · pencher la tête 1 s = je veux parler
// (getSwap() inverse gauche et droite si la caméra de l'appareil renvoie une image miroir)
//
// La logique oui / non reprend celle du programme Python validé avec une webcam (detection_oui_non.py) :
//   1. l'angle gauche/droite de la tête (lacet) est lu dans la matrice de pose fournie par MediaPipe,
//      par rapport à la position de repos calibrée au démarrage (durée réglable, getCalib) ;
//   2. amplitude 0 sous ANGLE_MIN, 1 au-delà de ANGLE_PLEIN (degrés × réglage « amplitude du mouvement ») ;
//   3. score oui (resp. non) = part de la dernière fenêtre de temps (le « temps de détection », getHold)
//      passée la tête tournée vers sa gauche (resp. sa droite), pondérée par l'amplitude : 100 % si elle
//      est restée franchement tournée pendant toute la fenêtre ;
//   4. état « oui » ou « non » quand le score dépasse SEUIL_HAUT, retour à « pas de détection précise »
//      quand il retombe sous SEUIL_BAS (hystérésis, pour éviter les clignotements).
// Un geste est émis à l'entrée dans l'état oui ou non : il faut revenir au centre avant d'en émettre un autre.

const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export const ANGLE_MIN = 8;      // degrés : en dessous, la tête est considérée de face
export const ANGLE_PLEIN = 20;   // degrés : au-delà, la tête est franchement tournée
export const FENETRE = 600;      // ms : temps de détection par défaut (réglable dans l'espace admin)
export const SEUIL_HAUT = 0.6;   // score à partir duquel on entre dans oui / non
export const SEUIL_BAS = 0.4;    // score sous lequel on revient à « pas de détection précise »
export const INCERTAIN = 'pas de détection précise';
const ROULIS = 15;               // degrés : inclinaison de la tête pour « parler »
const CALIB_MIN = 5;             // images minimales pour la calibration de la position de repos
const COOL_REPONSE = 1000, COOL_PARLER = 2000;   // ms : temps mort après un geste

// Angles de la tête en degrés à partir de la matrice de pose 4x4 de MediaPipe (`data`, 16 nombres).
// Le tableau peut être rangé par lignes ou par colonnes selon la version : on le reconnaît grâce aux zéros
// de la dernière ligne [0 0 0 1], la translation (dernière colonne) n'étant jamais nulle pour un visage.
// lacet > 0 : tête tournée vers la gauche de la personne (image brute, non inversée) · roulis : tête penchée.
export function anglesTete(m) {
  const parColonnes = m[3] === 0 && m[7] === 0 && m[11] === 0 && (m[12] !== 0 || m[13] !== 0 || m[14] !== 0);
  const r = parColonnes ? (i, j) => m[j * 4 + i] : (i, j) => m[i * 4 + j];
  const deg = 180 / Math.PI;
  return {
    tangage: Math.atan2(r(2, 1), r(2, 2)) * deg,
    lacet: Math.atan2(-r(2, 0), Math.hypot(r(2, 1), r(2, 2))) * deg,
    roulis: Math.atan2(r(1, 0), r(0, 0)) * deg,
  };
}

// Détecteur oui / non / pas de détection précise (même logique que la classe DetecteurRegard en Python).
// ajouter(t, d, k) : t en ms, d = angle signé en degrés (positif du côté « oui », null si aucun visage),
// k = réglage d'amplitude (1 = seuils par défaut). Renvoie { etat, score, scoreOui, scoreNon }.
// La propriété `fenetre` (ms) peut être changée à tout moment : c'est le temps de détection.
export function createDetecteurRegard({ angleMin = ANGLE_MIN, anglePlein = ANGLE_PLEIN, fenetre = FENETRE, seuilHaut = SEUIL_HAUT, seuilBas = SEUIL_BAS } = {}) {
  const ech = [];   // { t, oui, non } : poids (amplitude × durée) de chaque mesure de la fenêtre
  let tPrec = null, etat = INCERTAIN;
  const amplitude = (d, k) => Math.min(1, Math.max(0, (Math.abs(d) - angleMin * k) / ((anglePlein - angleMin) * k)));

  function ajouter(t, d, k = 1) {
    const dt = tPrec == null ? 0 : Math.max(0, t - tPrec);
    tPrec = t;
    let oui = 0, non = 0;
    if (d != null) { const p = amplitude(d, k) * dt; if (d > 0) oui = p; else non = p; }
    ech.push({ t, oui, non });
    while (t - ech[0].t > fenetre) ech.shift();
    let sOui = 0, sNon = 0;
    for (const e of ech) { sOui += e.oui; sNon += e.non; }
    sOui = Math.min(1, sOui / fenetre); sNon = Math.min(1, sNon / fenetre);

    // Sortie d'un état sous le seuil bas, puis entrée dans un état au-dessus du seuil haut.
    if (etat === 'oui' && sOui < seuilBas) etat = INCERTAIN;
    else if (etat === 'non' && sNon < seuilBas) etat = INCERTAIN;
    if (etat === INCERTAIN) { if (sOui >= seuilHaut) etat = 'oui'; else if (sNon >= seuilHaut) etat = 'non'; }
    const score = etat === 'oui' ? sOui : etat === 'non' ? sNon : Math.max(sOui, sNon);
    return { etat, score, scoreOui: sOui, scoreNon: sNon };
  }
  function reinitialiser() { ech.length = 0; tPrec = null; etat = INCERTAIN; }
  return {
    ajouter, reinitialiser,
    get etat() { return etat; },
    get fenetre() { return fenetre; }, set fenetre(v) { fenetre = Math.max(100, Number(v) || FENETRE); },
    // Seuil de déclenchement : score d'entrée ; la sortie se fait 20 points plus bas (hystérésis).
    get seuil() { return seuilHaut; }, set seuil(v) { seuilHaut = Math.min(0.95, Math.max(0.2, Number(v) || SEUIL_HAUT)); seuilBas = Math.max(0.1, seuilHaut - 0.2); },
  };
}

export function createHeadTracker({ video, onGesture, onMeters, onStatus, getSensitivity, getSwap = () => false, getFacing = () => 'environment', getHold = () => FENETRE / 1000, getCalib = () => 1, getSeuil = () => SEUIL_HAUT }) {
  let landmarker = null, stream = null, running = false, raf = 0, lastTime = -1;
  const det = createDetecteurRegard();
  const st = { base: null, calib: [], calibStart: 0, etatPrec: INCERTAIN, cool: 0, rollT: 0 };

  async function load() {
    if (landmarker) return;
    onStatus('Chargement du modèle…', '');
    const { FaceLandmarker, FilesetResolver } = await import(`${VISION}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
    const opts = delegate => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true });
    try { landmarker = await FaceLandmarker.createFromOptions(files, opts('GPU')); }
    catch { landmarker = await FaceLandmarker.createFromOptions(files, opts('CPU')); }
  }

  async function start() {
    // Caméra arrière par défaut : le téléphone est tenu par la personne en face d'Anna, écran vers elle.
    const facing = getFacing();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.style.transform = facing === 'user' ? 'scaleX(-1)' : 'none';   // aperçu en miroir seulement pour la caméra avant
    video.srcObject = stream;
    await video.play();
    await load();
    recalibrate();
    running = true;
    loop();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
  }

  // Position de repos : moyenne des angles pendant la durée de calibration (tête immobile, regard droit devant).
  function recalibrate() {
    Object.assign(st, { base: null, calib: [], calibStart: 0, etatPrec: INCERTAIN, rollT: 0 });
    det.reinitialiser();
    onStatus('Calibration : tête immobile…', '');
  }

  function loop() {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const now = performance.now();
      track(landmarker.detectForVideo(video, now), now);
    }
    raf = requestAnimationFrame(loop);
  }

  function track(res, now) {
    const m = res.facialTransformationMatrixes?.[0]?.data;
    if (!res.faceLandmarks?.[0] || !m) {
      det.reinitialiser(); st.rollT = 0;
      onMeters(0, 0, 0); onStatus('Visage non détecté', '');
      return;
    }
    const { lacet, roulis } = anglesTete(m);

    if (!st.base) {
      if (!st.calibStart) st.calibStart = now;
      st.calib.push([lacet, roulis]);
      if (now - st.calibStart < getCalib() * 1000 || st.calib.length < CALIB_MIN) return;
      const moy = i => st.calib.reduce((a, v) => a + v[i], 0) / st.calib.length;
      st.base = { y: moy(0), r: moy(1) };
      onStatus('Prêt', '');
    }
    const k = getSensitivity();
    det.fenetre = getHold() * 1000;        // temps de détection réglable
    det.seuil = getSeuil();                // seuil de déclenchement réglable
    const dr = roulis - st.base.r;
    // Dans l'image brute de la caméra, le lacet devient positif quand Anna tourne la tête vers SA gauche.
    let dy = lacet - st.base.y;
    if (getSwap()) dy = -dy;
    // Au repos, la position de référence suit lentement les petits glissements.
    if (Math.abs(dy) < ANGLE_MIN * k * 0.5 && Math.abs(dr) < ROULIS * k * 0.5) { st.base.y += 0.02 * (lacet - st.base.y); st.base.r += 0.02 * dr; }

    // Pencher la tête et tenir 1 seconde = je veux parler.
    if (Math.abs(dr) > ROULIS * k) {
      if (!st.rollT) st.rollT = now;
      if (now - st.rollT > 1000 && now >= st.cool) { fire('parler'); st.rollT = 0; st.cool = now + COOL_PARLER; det.reinitialiser(); }
    } else st.rollT = 0;

    const r = det.ajouter(now, dy, k);
    onMeters(r.scoreOui, r.scoreNon, st.rollT ? Math.min(1, (now - st.rollT) / 1000) : Math.min(1, Math.abs(dr) / (ROULIS * k)));
    const pct = Math.round(r.score * 100);
    onStatus(r.etat === INCERTAIN ? `Pas de détection précise · ${pct} %` : `${r.etat.toUpperCase()} · ${pct} %`, r.etat);

    // Un geste à l'entrée dans oui / non, une fois le temps mort passé ; retour au centre obligatoire entre deux.
    if (r.etat === INCERTAIN) st.etatPrec = INCERTAIN;
    else if (r.etat !== st.etatPrec && now >= st.cool) { fire(r.etat); st.cool = now + COOL_REPONSE; st.etatPrec = r.etat; }
  }

  const fire = g => onGesture(g);

  return { start, stop, recalibrate, get running() { return running; } };
}

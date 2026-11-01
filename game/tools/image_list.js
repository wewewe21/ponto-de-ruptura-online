// Imagens geradas com o Krea 2 Turbo (ComfyUI). name → { ar, mp, prompt, dir }
const PHOTO = 'photorealistic, cinematic lighting, highly detailed, AAA video game concept art, sharp focus';
const ART = (s) => `${s}, ${PHOTO}`;
const REF = 'neutral flat light gray studio background, soft even studio lighting, centered, full object visible, 3D render game asset reference, high detail, no text';
const TPOSE = (s) => `Full body character render of ${s}, front view, strict T-pose with both arms stretched out horizontally and legs slightly apart, no weapon in hands, bare hands open, ${REF}`;
const TEX = (s) => `${s}, seamless tileable texture, top-down flat orthographic view, even diffuse lighting, no shadows, no perspective, high resolution material scan, game PBR albedo texture`;

const UI = {
  title_bg: { ar: '16:9 (Widescreen)', mp: 2.0, dir: 'ui', prompt: ART('Cinematic key art poster: a lone special forces soldier seen from behind standing on the crest of a gigantic hydroelectric dam at night, violent thunderstorm, lightning illuminating the spillway gates and a huge concrete wall, heavy rain, volumetric fog, orange sodium floodlights, dark teal and amber color palette, dramatic scale, empty space on the left side for a title, no text') },
  title_bg2: { ar: '16:9 (Widescreen)', mp: 2.0, dir: 'ui', prompt: ART('Cinematic key art: a colossal armored combat robot walking through rain and smoke in a floodlit industrial substation at night, soldier silhouettes with rifles in the foreground, sparks and fire, teal and orange color grading, dramatic low angle, no text') },
  briefing_bg: { ar: '16:9 (Widescreen)', mp: 1.5, dir: 'ui', prompt: ART('Dark military briefing room, a large tactical table with a lit topographic map of a river valley and a dam, holographic blue overlays, dim lamps, scattered documents, rain on a window, moody atmosphere, no people, no text') },
  loading_bg: { ar: '16:9 (Widescreen)', mp: 1.5, dir: 'ui', prompt: ART('Night forest with tall pine trees in heavy rain and mist, a distant massive concrete dam glowing with floodlights between the hills, lightning in the clouds, cold blue tones, no people, no text') },
  death_bg: { ar: '16:9 (Widescreen)', mp: 1.5, dir: 'ui', prompt: ART('Close up of a fallen soldier helmet and rifle lying on wet concrete in the rain at night, red emergency light flashing, shallow depth of field, somber mood, no text') },
  victory_bg: { ar: '16:9 (Widescreen)', mp: 1.5, dir: 'ui', prompt: ART('Military helicopter flying away at dawn over a huge hydroelectric dam, golden sunrise breaking through storm clouds, mist over the valley, hopeful epic mood, no text') },
  pause_bg: { ar: '16:9 (Widescreen)', mp: 1.0, dir: 'ui', prompt: ART('Abstract dark tactical background with subtle topographic contour lines, faint grid, deep charcoal and teal gradient, vignette, no text') },
  emblem_squad: { ar: '1:1 (Square)', mp: 0.5, dir: 'ui', prompt: 'Military squad insignia patch, a hammer striking a lightning bolt over a shield, worn embroidered fabric patch, olive drab and orange, on a black background, no text' },
  emblem_enemy: { ar: '1:1 (Square)', mp: 0.5, dir: 'ui', prompt: 'Paramilitary group insignia, a drowned skull with water waves and a broken dam, worn spray painted stencil in red on dark concrete, no text' },
  ch_perimeter: { ar: '16:9 (Widescreen)', mp: 0.6, dir: 'ui/ch', prompt: ART('Barbed wire fence and floodlight towers at the edge of a dark pine forest, rain, searchlight beam sweeping, night') },
  ch_yard: { ar: '16:9 (Widescreen)', mp: 0.6, dir: 'ui/ch', prompt: ART('Electrical substation at night with large transformers and shipping containers, orange work lights, rain puddles, night') },
  ch_powerhouse: { ar: '16:9 (Widescreen)', mp: 0.6, dir: 'ui/ch', prompt: ART('Giant hydroelectric powerhouse interior with huge turbines and catwalks, red alarm lights, industrial') },
  ch_crest: { ar: '16:9 (Widescreen)', mp: 0.6, dir: 'ui/ch', prompt: ART('Crest road on top of a huge concrete dam at night, military trucks and sandbag barricades, spillway below, thunderstorm') },
  ch_tower: { ar: '16:9 (Widescreen)', mp: 0.6, dir: 'ui/ch', prompt: ART('Tall concrete control tower of dam gates at night, lightning, steel stairs, floodlights') },
  ch_gallery: { ar: '16:9 (Widescreen)', mp: 0.6, dir: 'ui/ch', prompt: ART('Long flooded concrete inspection gallery inside a dam, dim emergency lights, water on the floor, claustrophobic') },
  ch_barracks: { ar: '16:9 (Widescreen)', mp: 0.6, dir: 'ui/ch', prompt: ART('Military barracks and canteen interior at night, bunk beds, fluorescent lights, scattered gear') },
  ch_control: { ar: '16:9 (Widescreen)', mp: 0.6, dir: 'ui/ch', prompt: ART('Dam control room with banks of monitors and consoles glowing green and amber, dark room, big window over the reservoir') },
  ch_defense: { ar: '16:9 (Widescreen)', mp: 0.6, dir: 'ui/ch', prompt: ART('Soldiers defending a courtyard at night with tracer fire and explosions, rain, chaos, orange and teal') },
  ch_extract: { ar: '16:9 (Widescreen)', mp: 0.6, dir: 'ui/ch', prompt: ART('Military helicopter landing on a floodlit helipad at night in rain, soldiers running toward it, dramatic') },
};

const TEXTURES = {
  tex_concrete: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Weathered gray concrete wall surface with stains, cracks, water streaks and small pits') },
  tex_concrete_dark: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Dark wet concrete with moss stains and rust streaks, rough surface') },
  tex_floor: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Industrial concrete floor with expansion joints, oil stains and scratches') },
  tex_asphalt: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Wet cracked asphalt road surface with small gravel and patches') },
  tex_metal: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Dark gray painted steel plate with scratched worn paint, rivets and rust edges') },
  tex_rust: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Heavily rusted corrugated steel sheet with peeling paint') },
  tex_container: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Corrugated shipping container metal wall with vertical ridges, faded olive green paint, scratches and rust') },
  tex_wood: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Old weathered wooden planks, gray brown, with nails and cracks') },
  tex_ground: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Forest floor with wet mud, pine needles, small stones and dead leaves') },
  tex_grass: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Wet dark green grass and moss ground cover with soil patches') },
  tex_rock: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Rough dark gray cliff rock face with cracks and wet surface') },
  tex_gravel: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Wet gray gravel and crushed stone ground') },
  tex_sandbag: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Burlap sandbags stacked, tan and olive woven fabric with dirt') },
  tex_skyclouds: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: 'Dense dark storm clouds seen from below at night, layered heavy cumulonimbus overcast sky, soft billowing volumetric cloud masses with subtle contrast, seamless tileable, no horizon, no moon, grayscale blue tint, photograph' },
  tex_grate: { ar: '1:1 (Square)', mp: 1.0, dir: 'tex', prompt: TEX('Steel diamond plate and grating floor, scuffed, dark') },
};

// referências para o Trellis 2 (imagem → malha 3D)
const REFS = {
  // personagens (T-pose, para rig automático)
  sol_rifleman: { ar: '3:4 (Portrait Standard)', mp: 1.0, dir: 'refs', prompt: TPOSE('a paramilitary soldier wearing a dark gray tactical uniform, black balaclava covering the face, black plate carrier vest with pouches, knee pads, combat boots, red armband') },
  sol_rifleman2: { ar: '3:4 (Portrait Standard)', mp: 1.0, dir: 'refs', prompt: TPOSE('a paramilitary soldier wearing an olive brown tactical uniform, dark cap and short beard, chest rig with magazines, leather gloves, combat boots, red armband') },
  sol_heavy: { ar: '3:4 (Portrait Standard)', mp: 1.0, dir: 'refs', prompt: TPOSE('a bulky heavily armored heavy gunner in black body armor with thick plates, full face helmet with dark visor, shoulder pads, ammo belt, red armband') },
  sol_shield: { ar: '3:4 (Portrait Standard)', mp: 1.0, dir: 'refs', prompt: TPOSE('a riot tactical trooper in dark gray gear with a ballistic helmet and face guard, armored vest, knee and elbow pads') },
  sol_sniper: { ar: '3:4 (Portrait Standard)', mp: 1.0, dir: 'refs', prompt: TPOSE('a sniper in a green camouflage ghillie hooded suit with leafy strips, face covered with a scarf') },
  sol_ally1: { ar: '3:4 (Portrait Standard)', mp: 1.0, dir: 'refs', prompt: TPOSE('a special forces operator in tan and olive multicam uniform, ballistic helmet with night vision goggles mounted, plate carrier with pouches, tactical gloves and boots') },
  sol_ally2: { ar: '3:4 (Portrait Standard)', mp: 1.0, dir: 'refs', prompt: TPOSE('a female special forces operator in multicam uniform, ballistic helmet with night vision goggles, plate carrier, ponytail, tactical gloves and boots') },
  // árvores e vegetação
  tree_pine1: { ar: '2:3 (Portrait Photo)', mp: 1.0, dir: 'refs', prompt: `A single tall conifer pine tree with dense dark green layered branches and a straight brown trunk, ${REF}` },
  tree_pine2: { ar: '2:3 (Portrait Photo)', mp: 1.0, dir: 'refs', prompt: `A single wide spruce fir tree with drooping dark green branches, conical shape, ${REF}` },
  tree_dead: { ar: '2:3 (Portrait Photo)', mp: 1.0, dir: 'refs', prompt: `A single dead leafless tree with twisted gnarled bare branches, gray bark, ${REF}` },
  tree_bush: { ar: '1:1 (Square)', mp: 1.0, dir: 'refs', prompt: `A dense dark green shrub bush with ferns and leaves, ${REF}` },
  rock_big: { ar: '1:1 (Square)', mp: 1.0, dir: 'refs', prompt: `A large mossy gray granite boulder rock, ${REF}` },
  // veículos
  heli: { ar: '4:3 (Standard)', mp: 1.0, dir: 'refs', prompt: `A modern military transport helicopter, dark olive gray paint, three quarter front view, rotors included, ${REF}` },
  truck: { ar: '4:3 (Standard)', mp: 1.0, dir: 'refs', prompt: `A rugged pickup truck technical with a mounted heavy machine gun on the bed, rusty olive paint, three quarter front view, ${REF}` },
  truck_cargo: { ar: '4:3 (Standard)', mp: 1.0, dir: 'refs', prompt: `A military 6x6 cargo truck with a canvas tarp covered bed, olive drab paint, worn and muddy, three quarter front view, ${REF}` },
  // cenário
  prop_crate: { ar: '1:1 (Square)', mp: 1.0, dir: 'refs', prompt: `A stack of two military wooden supply crates with stenciled markings and metal latches, ${REF}` },
  prop_barrel: { ar: '1:1 (Square)', mp: 1.0, dir: 'refs', prompt: `Three rusty industrial oil drums barrels, dented, one with a hazard stripe, ${REF}` },
  prop_sandbags: { ar: '1:1 (Square)', mp: 1.0, dir: 'refs', prompt: `A curved sandbag barricade wall with a mounted machine gun position, stacked burlap sandbags, ${REF}` },
  prop_barrier: { ar: '3:2 (Photo)', mp: 1.0, dir: 'refs', prompt: `A concrete jersey barrier road block with yellow and black hazard stripes, worn, ${REF}` },
  prop_generator: { ar: '1:1 (Square)', mp: 1.0, dir: 'refs', prompt: `An industrial diesel power generator unit in a steel frame with cables, olive green, ${REF}` },
  prop_floodlight: { ar: '2:3 (Portrait Photo)', mp: 1.0, dir: 'refs', prompt: `A portable tripod floodlight tower with two big work lamps and a cable, ${REF}` },
  prop_transformer: { ar: '1:1 (Square)', mp: 1.0, dir: 'refs', prompt: `A large electrical power transformer with ribbed cooling radiators and porcelain insulators on top, gray paint, ${REF}` },
  prop_ammo: { ar: '3:2 (Photo)', mp: 1.0, dir: 'refs', prompt: `An open military ammunition crate in olive green with magazines and grenades inside, ${REF}` },
  prop_tent: { ar: '3:2 (Photo)', mp: 1.0, dir: 'refs', prompt: `A military canvas command tent in olive drab with ropes and stakes, ${REF}` },
  prop_container: { ar: '3:2 (Photo)', mp: 1.0, dir: 'refs', prompt: `A rusty worn shipping container, olive green corrugated metal with doors, ${REF}` },
};
module.exports = { UI, TEXTURES, REFS };

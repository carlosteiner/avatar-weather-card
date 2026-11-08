// Avatar Weather Card - prompt generator.
// Builds the text you paste into an image generator (together with the reference picture) to make one slot.
// Character-neutral: "the character" is whoever the reference picture shows. The outfit is composed at random
// from the wardrobe options the user ticked (see WARDROBE).

export const DEFAULT_PREFS = { extra: "", bg: "transparent", bgColor: "#808080" };   // bg: "transparent" (generator that cuts the figure out) or "solid" (flat colour, keyed out afterwards)

// ---------------------------------------------------------------------------------------------------------------
// Wardrobe catalogue. Each option: [id, category, text, warmest-band-it-suits-from, ... to, when, on-by-default]
// Bands: 0 freezing, 1 cold, 2 chilly, 3 mild, 4 warm, 5 hot, 6 heatwave.  when: "day" | "evening" | "any".
// ---------------------------------------------------------------------------------------------------------------
export const BAND_NAMES = ["freezing", "cold", "chilly", "mild", "warm", "hot", "heatwave"];
export const CATEGORIES = [
  ["outer", "Coats and jackets"], ["top", "Tops"], ["bottom", "Trousers, shorts and skirts"], ["dress", "Dresses"],
  ["shoes", "Shoes"], ["headwear", "Hats and caps"], ["scarf", "Scarves"], ["gloves", "Gloves"], ["accessory", "Bags and accessories"],
];
// [id, category, text, from band, to band, when, gender u/f/m, flags]   flags: d = in the starter sets, t = traditional/cultural, a = always worn when ticked
const W = [
  // --- coats and jackets
  ["parka", "outer", "a thick insulated parka with the hood down", 0, 1, "any", "u", "d"],
  ["puffer", "outer", "a long puffer coat", 0, 1, "any", "u", "d"],
  ["fitted_puffer", "outer", "a fitted long puffer coat with a belt", 0, 1, "any", "f", "d"],
  ["wool_coat", "outer", "a long wool coat, buttoned", 0, 2, "any", "u", "d"],
  ["camel_coat", "outer", "a camel wool coat", 1, 2, "evening", "u", "d"],
  ["peacoat", "outer", "a navy wool peacoat", 1, 2, "any", "u", "d"],
  ["fur_collar_coat", "outer", "a long dark wool coat with a faux-fur collar", 0, 1, "evening", "f", ""],
  ["overcoat", "outer", "a tailored charcoal overcoat", 0, 2, "evening", "m", "d"],
  ["duffle", "outer", "a duffle coat", 0, 2, "day", "u", ""],
  ["shearling", "outer", "a sheepskin-lined jacket", 0, 1, "any", "u", ""],
  ["fleece", "outer", "a fleece jacket", 1, 3, "day", "u", ""],
  ["quilted_vest", "outer", "a quilted vest", 1, 3, "day", "u", ""],
  ["denim_jacket", "outer", "a denim jacket", 2, 3, "day", "u", "d"],
  ["leather_jacket", "outer", "a leather jacket", 2, 3, "any", "u", "d"],
  ["biker_jacket", "outer", "a black biker jacket", 2, 3, "any", "u", ""],
  ["bomber", "outer", "a bomber jacket", 2, 3, "day", "u", ""],
  ["hoodie_zip", "outer", "a zip-up hoodie", 2, 4, "day", "u", ""],
  ["trench", "outer", "a light trench coat worn open", 2, 3, "any", "u", "d"],
  ["windbreaker", "outer", "a light windbreaker", 2, 4, "day", "u", ""],
  ["blazer", "outer", "a tailored blazer", 2, 4, "evening", "u", "d"],
  ["suit_jacket", "outer", "a suit jacket", 2, 5, "evening", "m", "d"],
  ["tweed_jacket", "outer", "a tweed jacket", 1, 3, "day", "m", ""],
  ["waistcoat", "outer", "a waistcoat", 2, 4, "evening", "m", ""],
  ["cardigan", "outer", "a soft cardigan", 3, 4, "any", "u", "d"],
  ["long_cardigan", "outer", "a long open cardigan", 2, 4, "day", "f", "d"],
  ["wrap_shawl", "outer", "a soft wool wrap shawl", 2, 4, "evening", "f", ""],
  ["open_shirt", "outer", "an open linen shirt worn over the top", 3, 5, "day", "u", "d"],
  // --- tops
  ["chunky_knit", "top", "a chunky knitted sweater", 0, 2, "day", "u", "d"],
  ["cable_knit", "top", "a cable-knit sweater", 0, 2, "day", "u", ""],
  ["wool_sweater", "top", "a wool crew-neck sweater", 0, 2, "day", "u", ""],
  ["turtleneck", "top", "a fine-knit turtleneck", 0, 3, "any", "u", "d"],
  ["flannel", "top", "a flannel shirt", 1, 3, "day", "u", ""],
  ["sweatshirt", "top", "a cotton sweatshirt", 1, 3, "day", "u", "d"],
  ["hoodie", "top", "a pullover hoodie", 1, 3, "day", "u", ""],
  ["striped_top", "top", "a striped long-sleeve top", 2, 3, "day", "u", "d"],
  ["ls_tee", "top", "a plain long-sleeve cotton top", 2, 4, "day", "u", "d"],
  ["henley", "top", "a henley shirt", 2, 4, "day", "m", ""],
  ["oxford_shirt", "top", "an oxford button-down shirt", 2, 5, "day", "m", "d"],
  ["shirt", "top", "a crisp cotton shirt", 2, 5, "any", "u", "d"],
  ["blouse", "top", "a loose cotton blouse", 2, 5, "day", "f", "d"],
  ["wrap_top", "top", "a wrap top", 3, 5, "day", "f", ""],
  ["tee", "top", "a short-sleeve cotton t-shirt", 3, 6, "day", "u", "d"],
  ["polo", "top", "a polo shirt", 3, 5, "day", "u", ""],
  ["off_shoulder", "top", "an off-the-shoulder peasant blouse", 4, 6, "day", "f", ""],
  ["linen_shirt", "top", "a short-sleeve linen shirt", 4, 6, "any", "u", "d"],
  ["sleeveless", "top", "a sleeveless cotton top", 4, 6, "day", "u", "d"],
  ["camisole", "top", "a thin-strap camisole", 4, 6, "any", "f", ""],
  ["crop_top", "top", "a cropped cotton top", 5, 6, "day", "f", ""],
  ["halter", "top", "a halter-neck top", 5, 6, "day", "f", ""],
  ["tank", "top", "a ribbed tank top", 5, 6, "day", "u", "d"],
  ["resort_shirt", "top", "a short-sleeve printed resort shirt", 5, 6, "day", "m", ""],
  ["heat_top", "top", "a featherlight sleeveless top", 6, 6, "any", "u", "d"],
  ["fine_knit", "top", "a fine knit top", 1, 4, "evening", "u", "d"],
  ["silk_blouse", "top", "a silk blouse", 2, 5, "evening", "f", "d"],
  ["tailored_shirt", "top", "a tailored shirt with the top button open", 2, 5, "evening", "u", "d"],
  ["dress_shirt", "top", "a crisp white dress shirt", 1, 5, "evening", "m", "d"],
  ["fitted_black_top", "top", "a fitted black top", 3, 5, "evening", "f", ""],
  ["satin_cami", "top", "a satin camisole", 4, 6, "evening", "f", ""],
  // --- trousers, shorts, skirts
  ["warm_trousers", "bottom", "warm insulated trousers", 0, 1, "day", "u", "d"],
  ["wool_trousers", "bottom", "wool trousers", 0, 2, "any", "u", "d"],
  ["thick_leggings", "bottom", "thick leggings", 0, 3, "day", "f", ""],
  ["jeans", "bottom", "dark indigo jeans", 0, 3, "day", "u", "d"],
  ["black_jeans", "bottom", "black jeans", 0, 3, "any", "u", ""],
  ["cords", "bottom", "corduroy trousers", 1, 3, "day", "u", ""],
  ["joggers", "bottom", "navy jogging bottoms", 1, 4, "day", "u", ""],
  ["chinos", "bottom", "relaxed chinos", 2, 4, "day", "u", "d"],
  ["cargo", "bottom", "cargo trousers", 3, 5, "day", "u", ""],
  ["tailored_trousers", "bottom", "tailored trousers", 0, 5, "evening", "u", "d"],
  ["wide_trousers", "bottom", "wide-leg trousers", 3, 5, "any", "f", ""],
  ["light_trousers", "bottom", "light linen trousers", 4, 5, "any", "u", "d"],
  ["shorts", "bottom", "light cotton shorts", 4, 6, "day", "u", "d"],
  ["bermuda", "bottom", "tailored bermuda shorts", 4, 6, "day", "m", ""],
  ["denim_shorts", "bottom", "denim shorts", 5, 6, "day", "u", ""],
  ["linen_shorts", "bottom", "short linen shorts", 5, 6, "any", "u", "d"],
  ["tweed_skirt", "bottom", "a tweed skirt with thick tights", 0, 2, "day", "f", ""],
  ["pleated_skirt", "bottom", "a pleated midi skirt", 1, 4, "day", "f", "d"],
  ["midi_skirt", "bottom", "a knee-length skirt", 2, 5, "any", "f", "d"],
  ["denim_skirt", "bottom", "a denim skirt", 3, 5, "day", "f", ""],
  ["maxi_skirt", "bottom", "a long maxi skirt", 3, 6, "day", "f", ""],
  ["mini_skirt", "bottom", "a short skirt", 3, 6, "any", "f", ""],
  ["flowy_skirt", "bottom", "a long flowy skirt", 4, 5, "day", "f", "d"],
  ["pencil_skirt", "bottom", "a pencil skirt", 1, 5, "evening", "f", "d"],
  ["satin_skirt", "bottom", "a satin midi skirt", 3, 5, "evening", "f", ""],
  // --- dresses and one-pieces
  ["wool_dress", "dress", "a fitted wool dress with sheer dark tights", 0, 2, "any", "f", "d"],
  ["knit_dress", "dress", "a knitted sweater dress with warm tights", 0, 3, "day", "f", ""],
  ["fitted_dress", "dress", "a fitted midi dress", 1, 4, "evening", "f", "d"],
  ["shirt_dress", "dress", "a casual shirt dress", 3, 5, "day", "f", "d"],
  ["wrap_dress", "dress", "a wrap dress", 3, 5, "any", "f", ""],
  ["denim_dress", "dress", "a denim dress", 3, 5, "day", "f", ""],
  ["jumpsuit", "dress", "a utility jumpsuit", 3, 5, "day", "u", ""],
  ["little_black", "dress", "a little black dress", 3, 5, "evening", "f", "d"],
  ["cocktail_dress", "dress", "a cocktail dress", 3, 6, "evening", "f", ""],
  ["sundress", "dress", "a light summer dress", 4, 6, "day", "f", "d"],
  ["maxi_dress", "dress", "a flowing maxi dress", 4, 6, "day", "f", ""],
  ["slip_dress", "dress", "a thin silk slip dress", 4, 6, "evening", "f", "d"],
  // --- shoes
  ["sneakers", "shoes", "clean white sneakers", 0, 6, "day", "u", "d"],
  ["dark_trainers", "shoes", "dark leather trainers", 0, 4, "day", "u", "d"],
  ["running_shoes", "shoes", "running shoes", 0, 5, "day", "u", ""],
  ["canvas_sneakers", "shoes", "canvas sneakers", 3, 6, "day", "u", ""],
  ["snow_boots", "shoes", "insulated snow boots", 0, 1, "day", "u", ""],
  ["hiking_boots", "shoes", "hiking boots", 0, 2, "day", "u", ""],
  ["ankle_boots", "shoes", "ankle boots", 0, 3, "any", "u", ""],
  ["chelsea_boots", "shoes", "chelsea boots", 0, 3, "any", "u", ""],
  ["tall_boots", "shoes", "tall leather boots", 0, 2, "any", "f", ""],
  ["loafers", "shoes", "leather loafers", 2, 5, "any", "u", ""],
  ["ballet", "shoes", "ballet flats", 2, 6, "day", "f", "d"],
  ["mary_janes", "shoes", "mary jane flats", 2, 5, "day", "f", ""],
  ["sandals", "shoes", "flat open sandals", 4, 6, "day", "u", "d"],
  ["espadrilles", "shoes", "espadrilles", 4, 6, "day", "u", ""],
  ["flipflops", "shoes", "leather flip-flops", 5, 6, "day", "u", ""],
  ["slides", "shoes", "slide sandals", 5, 6, "day", "u", ""],
  ["wedges", "shoes", "wedge sandals", 4, 6, "day", "f", ""],
  ["block_heels", "shoes", "block-heeled shoes", 3, 6, "any", "f", ""],
  ["oxfords", "shoes", "polished leather shoes", 0, 5, "evening", "u", "d"],
  ["derbies", "shoes", "leather derby shoes", 2, 5, "evening", "m", ""],
  ["smart_loafers", "shoes", "smart leather loafers", 2, 6, "evening", "u", "d"],
  ["heels", "shoes", "elegant high-heeled shoes", 0, 6, "evening", "f", "d"],
  ["stilettos", "shoes", "stiletto pumps", 2, 6, "evening", "f", ""],
  ["heeled_sandals", "shoes", "strappy heeled sandals", 4, 6, "evening", "f", "d"],
  // --- hats and head
  ["beanie", "headwear", "a chunky knitted beanie", 0, 1, "any", "u", "d"],
  ["wool_hat", "headwear", "a wool hat", 0, 2, "any", "u", ""],
  ["fur_hat", "headwear", "a fur-trimmed hat", 0, 1, "any", "u", ""],
  ["ear_warmers", "headwear", "ear warmers", 0, 1, "day", "u", ""],
  ["beret", "headwear", "a beret", 1, 4, "day", "f", ""],
  ["flat_cap", "headwear", "a flat cap", 1, 4, "day", "m", ""],
  ["fedora", "headwear", "a fedora", 2, 4, "any", "u", ""],
  ["cap", "headwear", "a baseball cap", 3, 6, "day", "u", ""],
  ["hairband", "headwear", "a hairband", 3, 6, "any", "f", ""],
  ["silk_headscarf", "headwear", "a silk headscarf tied under the chin", 2, 5, "day", "f", ""],
  ["bucket_hat", "headwear", "a bucket hat", 4, 6, "day", "u", ""],
  ["sunglasses", "headwear", "sunglasses", 4, 6, "day", "u", ""],
  ["straw_hat", "headwear", "a straw hat", 5, 6, "day", "u", ""],
  ["sunhat", "headwear", "a wide-brimmed sun hat", 5, 6, "day", "u", ""],
  // --- scarves and gloves
  ["scarf_wide", "scarf", "a wide soft scarf", 0, 2, "any", "u", "d"],
  ["scarf_chunky", "scarf", "a chunky knitted scarf", 0, 1, "day", "u", "d"],
  ["snood", "scarf", "a snood", 0, 2, "day", "u", ""],
  ["scarf_thin", "scarf", "a thin scarf", 2, 3, "any", "u", "d"],
  ["silk_scarf", "scarf", "a silk neck scarf", 3, 5, "any", "f", ""],
  ["bandana", "scarf", "a bandana knotted at the neck", 3, 5, "day", "u", ""],
  ["gloves", "gloves", "warm gloves", 0, 1, "any", "u", "d"],
  ["mittens", "gloves", "knitted mittens", 0, 1, "day", "u", ""],
  ["leather_gloves", "gloves", "leather gloves", 0, 2, "evening", "u", ""],
  // --- bags and accessories
  ["tote", "accessory", "a canvas tote bag", 0, 6, "day", "u", "d"],
  ["backpack", "accessory", "a small backpack", 0, 6, "day", "u", ""],
  ["crossbody", "accessory", "a small crossbody bag", 0, 6, "any", "u", "d"],
  ["messenger", "accessory", "a messenger bag", 0, 6, "day", "m", ""],
  ["handbag", "accessory", "a leather handbag", 0, 6, "any", "f", ""],
  ["clutch", "accessory", "a small clutch", 0, 6, "evening", "f", "d"],
  ["watch", "accessory", "a slim wristwatch", 0, 6, "any", "u", "d"],
  ["belt", "accessory", "a leather belt", 0, 6, "any", "u", ""],
  ["necktie", "accessory", "a necktie", 1, 5, "evening", "m", ""],
  ["pocket_square", "accessory", "a pocket square", 1, 4, "evening", "m", ""],
  ["gold_chain", "accessory", "a fine gold chain", 0, 6, "evening", "u", "d"],
  ["earrings", "accessory", "small drop earrings", 0, 6, "evening", "f", ""],
  ["hoops", "accessory", "hoop earrings", 0, 6, "any", "f", ""],
  ["pendant", "accessory", "a delicate pendant necklace", 0, 6, "any", "f", ""],
  ["bracelet", "accessory", "a thin bracelet", 0, 6, "any", "u", ""],
  ["fan", "accessory", "a folding paper fan", 5, 6, "any", "u", "d"],
  ["water", "accessory", "a small chilled water bottle beaded with condensation", 5, 6, "day", "u", "d"],
  // --- traditional and cultural dress (all optional, nothing ticked by default; headwear marked "a" is always worn when ticked)
  ["hijab", "headwear", "a hijab", 0, 6, "any", "f", "ta"],
  ["turban", "headwear", "a neatly tied turban (dastar)", 0, 6, "any", "u", "ta"],
  ["kippah", "headwear", "a kippah", 0, 6, "any", "u", "ta"],
  ["kufi", "headwear", "a kufi cap", 0, 6, "any", "u", "ta"],
  ["mantilla", "headwear", "a lace mantilla", 0, 6, "evening", "f", "ta"],
  ["conical_hat", "headwear", "a conical straw hat (non la)", 4, 6, "day", "u", "ta"],
  ["abaya", "dress", "a long loose abaya", 0, 6, "any", "f", "t"],
  ["thobe", "dress", "a long white thobe", 2, 6, "any", "m", "t"],
  ["kaftan", "dress", "a flowing kaftan", 3, 6, "any", "f", "t"],
  ["sari", "dress", "a sari with a matching blouse, draped over one shoulder", 2, 6, "any", "f", "t"],
  ["salwar", "dress", "a salwar kameez with a dupatta", 1, 6, "any", "f", "t"],
  ["lehenga", "dress", "a lehenga with a dupatta", 3, 6, "evening", "f", "t"],
  ["kurta", "dress", "a kurta with straight trousers", 1, 6, "any", "m", "t"],
  ["sherwani", "dress", "a sherwani", 2, 5, "evening", "m", "t"],
  ["kimono", "dress", "a kimono tied with an obi", 2, 5, "any", "u", "t"],
  ["yukata", "dress", "a light cotton yukata", 5, 6, "day", "u", "t"],
  ["hanbok", "dress", "a hanbok", 1, 5, "any", "u", "t"],
  ["qipao", "dress", "a qipao (cheongsam)", 3, 6, "any", "f", "t"],
  ["ao_dai", "dress", "an ao dai over wide trousers", 3, 6, "any", "f", "t"],
  ["dashiki", "dress", "a colourful dashiki shirt with matching trousers", 3, 6, "day", "u", "t"],
  ["boubou", "dress", "a flowing boubou", 3, 6, "any", "u", "t"],
  ["kente", "dress", "a kente cloth wrap", 3, 6, "evening", "u", "t"],
  ["huipil", "dress", "an embroidered huipil dress", 3, 6, "day", "f", "t"],
  ["dirndl", "dress", "a dirndl with an apron", 2, 5, "day", "f", "t"],
  ["lederhosen", "dress", "lederhosen with a checked shirt", 3, 5, "day", "m", "t"],
  ["kilt", "bottom", "a kilt with kilt hose", 1, 4, "any", "m", "t"],
  ["sarong", "bottom", "a sarong wrapped at the waist", 5, 6, "day", "u", "t"],
  ["poncho", "outer", "a woven poncho", 0, 2, "day", "u", "t"],
  ["bindi", "accessory", "a small bindi", 0, 6, "any", "f", "t"],
  ["henna", "accessory", "henna patterns on the hands", 0, 6, "any", "f", "t"],
  ["cross", "accessory", "a small cross pendant", 0, 6, "any", "u", "t"],
  ["star_david", "accessory", "a small Star of David pendant", 0, 6, "any", "u", "t"],
  ["prayer_beads", "accessory", "a string of prayer beads in one hand", 0, 6, "any", "u", "t"],
];

// --- more options (v0.12)
const W2 = [
  // coats and jackets, incl. weather-specific ones (see SKY_TAG)
  ["rain_yellow", "outer", "a bright yellow raincoat", 2, 4, "day", "u", ""],
  ["rain_trench", "outer", "a waterproof trench coat", 2, 4, "any", "u", ""],
  ["rain_shell", "outer", "a waterproof shell jacket with the hood up", 1, 4, "day", "u", ""],
  ["rain_packable", "outer", "a lightweight packable raincoat", 4, 6, "day", "u", ""],
  ["rain_cape", "outer", "a hooded rain cape", 2, 5, "day", "f", ""],
  ["rain_poncho", "outer", "a clear hooded rain poncho", 3, 6, "day", "u", ""],
  ["ski_jacket", "outer", "a padded ski-style jacket", 0, 1, "day", "u", ""],
  ["down_hood_coat", "outer", "a long down coat with a fur-trimmed hood", 0, 1, "any", "u", ""],
  ["wind_jacket", "outer", "a windproof jacket", 1, 4, "day", "u", ""],
  ["varsity", "outer", "a varsity jacket", 2, 3, "day", "u", ""],
  ["field_jacket", "outer", "a field jacket", 2, 4, "day", "u", ""],
  ["cropped_jacket", "outer", "a cropped jacket", 2, 4, "any", "f", ""],
  ["velvet_blazer", "outer", "a velvet blazer", 2, 4, "evening", "u", ""],
  ["faux_fur_coat", "outer", "a faux-fur coat", 0, 1, "evening", "f", ""],
  ["cape_coat", "outer", "a wool cape coat", 1, 2, "any", "f", ""],
  ["kimono_jacket", "outer", "a light printed kimono-style jacket", 4, 5, "day", "f", ""],
  ["linen_jacket", "outer", "an unlined linen jacket", 4, 5, "any", "u", ""],
  // tops
  ["thermal_top", "top", "a thermal long-sleeve top", 0, 1, "day", "u", ""],
  ["mock_neck", "top", "a mock-neck sweater", 0, 2, "any", "u", ""],
  ["cashmere", "top", "a cashmere sweater", 0, 3, "evening", "u", ""],
  ["vneck", "top", "a v-neck sweater", 1, 3, "any", "u", ""],
  ["fisherman", "top", "a fisherman sweater", 0, 2, "day", "u", ""],
  ["rugby", "top", "a rugby shirt", 1, 3, "day", "u", ""],
  ["baseball_tee", "top", "a baseball tee with contrast sleeves", 3, 5, "day", "u", ""],
  ["linen_tunic", "top", "a linen tunic", 4, 6, "day", "f", ""],
  ["peasant", "top", "a embroidered peasant top", 4, 6, "day", "f", ""],
  ["lace_trim", "top", "a top with lace trim", 3, 6, "any", "f", ""],
  ["sequin_top", "top", "a sequined top", 3, 6, "evening", "f", ""],
  ["velvet_blouse", "top", "a velvet blouse", 0, 4, "evening", "f", ""],
  ["tux_shirt", "top", "a tuxedo shirt", 1, 5, "evening", "m", ""],
  ["guayabera", "top", "a guayabera shirt", 4, 6, "day", "m", ""],
  ["silk_shirt", "top", "a silk shirt", 3, 6, "evening", "u", ""],
  ["knit_vest", "top", "a sleeveless knit vest over a shirt", 1, 3, "day", "u", ""],
  ["tunic_top", "top", "a long tunic top", 3, 5, "day", "f", ""],
  ["ribbed_tee", "top", "a ribbed long-sleeve tee", 3, 4, "day", "f", ""],
  ["raglan", "top", "a raglan-sleeve sweatshirt", 1, 3, "day", "u", ""],
  // bottoms
  ["slim_trousers", "bottom", "slim trousers", 2, 5, "evening", "u", ""],
  ["pinstripe", "bottom", "pinstripe trousers", 1, 4, "evening", "m", ""],
  ["velvet_trousers", "bottom", "velvet trousers", 0, 3, "evening", "u", ""],
  ["leather_leggings", "bottom", "leather leggings", 0, 3, "evening", "f", ""],
  ["culottes", "bottom", "culottes", 3, 5, "day", "f", ""],
  ["paperbag", "bottom", "paperbag-waist trousers", 3, 5, "day", "f", ""],
  ["palazzo", "bottom", "palazzo trousers", 4, 6, "any", "f", ""],
  ["harem", "bottom", "light harem trousers", 4, 6, "day", "u", ""],
  ["track_pants", "bottom", "track pants", 1, 4, "day", "u", ""],
  ["ripped_jeans", "bottom", "ripped jeans", 2, 4, "day", "u", ""],
  ["white_jeans", "bottom", "white jeans", 4, 5, "day", "u", ""],
  ["skinny_jeans", "bottom", "skinny jeans", 0, 3, "day", "f", ""],
  ["wide_jeans", "bottom", "wide-leg jeans", 2, 5, "day", "u", ""],
  ["pleated_shorts", "bottom", "pleated shorts", 4, 6, "day", "u", ""],
  ["cycling_shorts", "bottom", "cycling shorts", 5, 6, "day", "u", ""],
  ["tennis_skirt", "bottom", "a pleated tennis skirt", 4, 6, "day", "f", ""],
  ["wrap_skirt", "bottom", "a wrap skirt", 3, 6, "any", "f", ""],
  ["leather_skirt", "bottom", "a leather skirt", 1, 4, "evening", "f", ""],
  ["velvet_skirt", "bottom", "a velvet skirt", 0, 3, "evening", "f", ""],
  ["tulle_skirt", "bottom", "a tulle skirt", 4, 6, "evening", "f", ""],
  ["overalls", "bottom", "denim overalls", 3, 5, "day", "u", ""],
  // dresses and one-pieces
  ["velvet_dress", "dress", "a velvet dress with sheer tights", 0, 3, "evening", "f", ""],
  ["sequin_dress", "dress", "a sequined dress", 3, 6, "evening", "f", ""],
  ["tea_dress", "dress", "a tea dress", 3, 5, "day", "f", ""],
  ["polka_dress", "dress", "a polka-dot dress", 3, 5, "day", "f", ""],
  ["floral_midi", "dress", "a floral midi dress", 3, 5, "day", "f", ""],
  ["knit_midi", "dress", "a knitted midi dress", 1, 3, "day", "f", ""],
  ["gown", "dress", "a long evening gown", 2, 6, "evening", "f", ""],
  ["halter_dress", "dress", "a halter-neck dress", 4, 6, "any", "f", ""],
  ["tennis_dress", "dress", "a sporty tennis dress", 5, 6, "day", "f", ""],
  ["pinafore", "dress", "a corduroy pinafore dress over a fine knit", 1, 3, "day", "f", ""],
  ["tuxedo", "dress", "a black tuxedo with a bow tie", 1, 5, "evening", "m", ""],
  ["three_piece", "dress", "a three-piece suit", 0, 3, "evening", "m", ""],
  ["linen_suit", "dress", "a light linen suit", 4, 6, "evening", "m", ""],
  ["two_piece", "dress", "a tailored two-piece suit", 2, 5, "evening", "m", ""],
  ["boiler_suit", "dress", "a boiler suit", 3, 5, "day", "u", ""],
  // shoes
  ["rain_boots", "shoes", "rubber rain boots", 0, 4, "day", "u", ""],
  ["waterproof_boots", "shoes", "waterproof ankle boots", 0, 3, "any", "u", ""],
  ["fur_boots", "shoes", "fur-lined winter boots", 0, 1, "day", "u", ""],
  ["gladiators", "shoes", "strappy gladiator sandals", 4, 6, "day", "f", ""],
  ["platform_sneakers", "shoes", "platform sneakers", 3, 6, "day", "f", ""],
  ["high_tops", "shoes", "high-top sneakers", 1, 5, "day", "u", ""],
  ["slip_ons", "shoes", "slip-on sneakers", 3, 6, "day", "u", ""],
  ["boat_shoes", "shoes", "boat shoes", 3, 6, "day", "m", ""],
  ["monk_straps", "shoes", "monk-strap shoes", 2, 5, "evening", "m", ""],
  ["kitten_heels", "shoes", "kitten-heel pumps", 2, 6, "any", "f", ""],
  ["pointed_flats", "shoes", "pointed flats", 2, 5, "day", "f", ""],
  ["knee_boots", "shoes", "knee-high boots", 0, 2, "any", "f", ""],
  ["cowboy_boots", "shoes", "cowboy boots", 0, 3, "any", "u", ""],
  ["moccasins", "shoes", "moccasins", 1, 3, "day", "u", ""],
  ["clogs", "shoes", "wooden clogs", 3, 5, "day", "u", ""],
  ["platform_heels", "shoes", "platform heels", 3, 6, "evening", "f", ""],
  // hats and head
  ["rain_hat", "headwear", "a waterproof rain hat", 3, 5, "day", "u", ""],
  ["bobble_hat", "headwear", "a bobble hat", 0, 1, "day", "u", ""],
  ["trapper", "headwear", "a trapper hat with ear flaps", 0, 1, "day", "u", ""],
  ["visor", "headwear", "a sun visor", 5, 6, "day", "u", ""],
  ["panama", "headwear", "a panama hat", 5, 6, "day", "u", ""],
  ["cloche", "headwear", "a cloche hat", 1, 4, "evening", "f", ""],
  ["rib_headband", "headwear", "a ribbed knit headband", 0, 2, "day", "f", ""],
  ["newsboy", "headwear", "a newsboy cap", 1, 4, "day", "u", ""],
  ["bandana_head", "headwear", "a bandana worn as a headband", 4, 6, "day", "u", ""],
  // scarves and gloves
  ["cashmere_scarf", "scarf", "a cashmere scarf", 0, 2, "evening", "u", ""],
  ["tartan_scarf", "scarf", "a tartan blanket scarf", 0, 2, "day", "u", ""],
  ["neck_gaiter", "scarf", "a neck gaiter", 0, 1, "day", "u", ""],
  ["fingerless", "gloves", "fingerless gloves", 0, 2, "day", "u", ""],
  ["touch_gloves", "gloves", "touchscreen gloves", 0, 2, "day", "u", ""],
  // bags and accessories
  ["flask", "accessory", "a travel flask of hot tea", 0, 2, "day", "u", ""],
  ["coffee_cup", "accessory", "a takeaway coffee cup", 0, 3, "day", "u", ""],
  ["earphones", "accessory", "earphones around the neck", 0, 6, "day", "u", ""],
  ["book", "accessory", "a book under one arm", 0, 6, "day", "u", ""],
  ["camera", "accessory", "a camera on a strap", 0, 6, "day", "u", ""],
  ["beach_bag", "accessory", "a woven beach bag", 5, 6, "day", "u", ""],
  ["straw_bag", "accessory", "a straw basket bag", 4, 6, "day", "f", ""],
  ["satchel", "accessory", "a leather satchel", 0, 6, "day", "u", ""],
  ["rings", "accessory", "stacked rings", 0, 6, "any", "f", ""],
  ["signet", "accessory", "a signet ring", 0, 6, "any", "m", ""],
  ["cufflinks", "accessory", "cufflinks", 1, 5, "evening", "m", ""],
  ["beads", "accessory", "a beaded necklace", 4, 6, "any", "f", ""],
  ["charm_bracelet", "accessory", "a charm bracelet", 0, 6, "any", "f", ""],
  ["long_pendant", "accessory", "a long pendant necklace", 0, 6, "evening", "f", ""],
  ["smartwatch", "accessory", "a smartwatch", 0, 6, "day", "u", ""],
  ["bunch_flowers", "accessory", "a small bunch of flowers", 0, 6, "any", "f", ""],
  ["umbrella_cane", "accessory", "a long folded umbrella carried like a walking stick", 0, 4, "any", "u", ""],
];
export const WARDROBE = [...W, ...W2].map(([id, cat, text, lo, hi, when, g, fl]) => ({ id, cat, text, lo, hi, when, g, d: fl.includes("d"), trad: fl.includes("t"), always: fl.includes("a") }));

// Weather-specific options (everything else suits any sky). Slot sky -> groups: see skyGroups().
export const SKY_TAGS = { sun: "sunny", wet: "rainy / stormy", snow: "snowy", wind: "windy" };
const SKY_TAG = {
  sunglasses: "sun", sunhat: "sun", straw_hat: "sun", panama: "sun", visor: "sun", beach_bag: "sun",
  rain_yellow: "wet", rain_trench: "wet", rain_shell: "wet", rain_packable: "wet", rain_cape: "wet", rain_poncho: "wet",
  rain_boots: "wet", waterproof_boots: "wet", rain_hat: "wet", umbrella_cane: "wet",
  snow_boots: "snow", ski_jacket: "snow", down_hood_coat: "snow", fur_boots: "snow", trapper: "snow", bobble_hat: "snow", mittens: "snow",
  wind_jacket: "wind", windbreaker: "wind", neck_gaiter: "wind", bandana: "wind",
};
WARDROBE.forEach((w) => { w.sky = SKY_TAG[w.id] || ""; });
export function skyGroups(sky) {
  if (sky === "clear" || sky === "fair") return ["sun"];
  if (sky === "wind") return ["wind"];
  if (sky === "rain" || sky === "storm" || sky === "hail" || sky === "sleet") return ["wet"];
  if (sky === "snow" || sky === "snowstorm") return ["snow"];
  return [];
}

// Colours: [id, name, family, swatch, roles]  roles: o outerwear, t tops and knits, b trousers and skirts, l light summer clothes, e evening, a shoes, bags and leather
export const COLOR_FAMILIES = ["Neutrals", "Greens", "Blues", "Reds and warm tones", "Pinks and purples"];
export const COLORS = [
  ["black", "black", 0, "#111", "otbea"], ["white", "white", 0, "#f7f7f2", "tbl"], ["cream", "cream", 0, "#f3ead3", "toblea"], ["ivory", "ivory", 0, "#f6f1e0", "tle"],
  ["beige", "beige", 0, "#d8c3a5", "otbla"], ["camel", "camel", 0, "#b98b50", "oba"], ["tan", "tan", 0, "#c49a6c", "oba"], ["brown", "brown", 0, "#6b4226", "otba"],
  ["chocolate", "chocolate brown", 0, "#4a2c1a", "oba"], ["charcoal", "charcoal", 0, "#3b3b40", "otba"],
  ["olive", "olive green", 1, "#6b6b2f", "otbl"], ["khaki", "khaki", 1, "#a89a62", "obl"], ["sage", "sage green", 1, "#9caf88", "tlo"], ["forest", "forest green", 1, "#1f4d2b", "otbe"],
  ["emerald", "emerald green", 1, "#0e8f5a", "tel"], ["teal", "teal", 1, "#1b7f86", "tole"],
  ["navy", "navy", 2, "#14213d", "otbea"], ["royal", "royal blue", 2, "#2352c8", "tel"], ["cornflower", "cornflower blue", 2, "#6495ed", "tl"], ["skyblue", "sky blue", 2, "#87b9e8", "tl"], ["powder", "powder blue", 2, "#b6d0e2", "tl"],
  ["burgundy", "burgundy", 3, "#6d1a2c", "otbea"], ["wine", "wine red", 3, "#7b1e3a", "ote"], ["red", "red", 3, "#c8102e", "otela"], ["coral", "coral", 3, "#f77f6b", "tl"], ["terracotta", "terracotta", 3, "#c1623f", "tlo"],
  ["rust", "rust", 3, "#a4471f", "to"], ["orange", "orange", 3, "#f28c28", "tl"], ["mustard", "mustard yellow", 3, "#d6a21c", "tlo"], ["butter", "butter yellow", 3, "#f4e18a", "tl"],
  ["blush", "blush pink", 4, "#f2c6c6", "tlo"], ["dustyrose", "dusty rose", 4, "#c98b92", "tol"], ["fuchsia", "fuchsia", 4, "#d6246e", "tle"], ["lavender", "lavender", 4, "#b7a3d6", "tl"],
  ["lilac", "lilac", 4, "#c8a2c8", "tl"], ["plum", "plum", 4, "#5b2a5a", "otbe"],
].map(([id, name, fam, hex, roles]) => ({ id, name, fam, hex, roles }));
export const defaultColors = () => COLORS.filter((c) => c.id !== "fuchsia").map((c) => c.id);

// Which role of colour an option takes (options not listed keep their own colour: jeans, white sneakers, a navy peacoat...)
const COLOR_ROLE = {
  parka: "o", puffer: "o", fitted_puffer: "o", wool_coat: "o", duffle: "o", fleece: "o", quilted_vest: "o", leather_jacket: "a", bomber: "o", hoodie_zip: "o", trench: "o", windbreaker: "o", blazer: "o",
  cardigan: "t", long_cardigan: "t", wrap_shawl: "t", open_shirt: "l", wind_jacket: "o", rain_trench: "o", rain_shell: "o", rain_packable: "l", rain_cape: "o", cape_coat: "o", field_jacket: "o", varsity: "o", cropped_jacket: "o",
  linen_jacket: "l", velvet_blazer: "e", faux_fur_coat: "o", kimono_jacket: "l", ski_jacket: "o", down_hood_coat: "o",
  chunky_knit: "t", cable_knit: "t", wool_sweater: "t", turtleneck: "t", sweatshirt: "t", hoodie: "t", ls_tee: "t", henley: "t", shirt: "t", blouse: "t", wrap_top: "t", tee: "t", polo: "t",
  off_shoulder: "l", linen_shirt: "l", sleeveless: "l", camisole: "l", crop_top: "l", halter: "l", tank: "l", heat_top: "l", fine_knit: "t", silk_blouse: "e", tailored_shirt: "e", satin_cami: "e",
  thermal_top: "t", mock_neck: "t", cashmere: "t", vneck: "t", fisherman: "t", rugby: "t", linen_tunic: "l", peasant: "l", lace_trim: "l", sequin_top: "e", velvet_blouse: "e", silk_shirt: "e", knit_vest: "t", tunic_top: "t", ribbed_tee: "t", raglan: "t",
  warm_trousers: "b", wool_trousers: "b", thick_leggings: "b", cords: "b", joggers: "b", chinos: "b", cargo: "b", tailored_trousers: "b", wide_trousers: "b", light_trousers: "l", shorts: "l", bermuda: "b", linen_shorts: "l",
  pleated_skirt: "b", midi_skirt: "b", maxi_skirt: "l", mini_skirt: "b", flowy_skirt: "l", pencil_skirt: "b", satin_skirt: "e",
  slim_trousers: "b", velvet_trousers: "e", leather_leggings: "b", culottes: "b", paperbag: "b", palazzo: "l", harem: "l", track_pants: "b", wide_jeans: "", pleated_shorts: "l", tennis_skirt: "l", wrap_skirt: "l", leather_skirt: "b", velvet_skirt: "e", tulle_skirt: "e",
  wool_dress: "t", knit_dress: "t", fitted_dress: "e", shirt_dress: "l", wrap_dress: "t", jumpsuit: "b", cocktail_dress: "e", sundress: "l", maxi_dress: "l", slip_dress: "e",
  velvet_dress: "e", sequin_dress: "e", tea_dress: "l", knit_midi: "t", gown: "e", halter_dress: "l", tennis_dress: "l", pinafore: "b", boiler_suit: "b",
  loafers: "a", ballet: "a", mary_janes: "a", sandals: "a", wedges: "a", block_heels: "a", oxfords: "a", derbies: "a", smart_loafers: "a", heels: "e", stilettos: "e", heeled_sandals: "e", ankle_boots: "a", chelsea_boots: "a", tall_boots: "a",
  gladiators: "a", monk_straps: "a", kitten_heels: "e", pointed_flats: "a", knee_boots: "a", cowboy_boots: "a", platform_heels: "e", rain_boots: "t", waterproof_boots: "a", moccasins: "a",
  beanie: "t", wool_hat: "t", beret: "t", flat_cap: "a", fedora: "a", cap: "t", bucket_hat: "l", hairband: "t", silk_headscarf: "t", hijab: "t", turban: "t", bobble_hat: "t", newsboy: "a", rib_headband: "t", cloche: "e",
  scarf_wide: "t", scarf_chunky: "t", snood: "t", scarf_thin: "t", silk_scarf: "t", bandana: "l", cashmere_scarf: "t", tartan_scarf: "t", neck_gaiter: "t",
  gloves: "a", mittens: "t", leather_gloves: "a",
  tote: "t", backpack: "t", crossbody: "a", handbag: "a", clutch: "e", messenger: "a", belt: "a", necktie: "e", pocket_square: "t", satchel: "a", straw_bag: "", beach_bag: "l",
  abaya: "a", salwar: "t", lehenga: "e", kurta: "t", kaftan: "l", boubou: "t", sari: "t", sherwani: "e", kimono: "t",
};
WARDROBE.forEach((w) => { w.role = COLOR_ROLE[w.id] || ""; });
export const GENDERS = { u: "unisex", f: "feminine", m: "masculine" };
// Starter sets: neutral = unisex starters; feminine = unisex + feminine starters; masculine = unisex + masculine starters.
export const presetIds = (kind) => WARDROBE.filter((w) => w.d && (w.g === "u" || (kind === "feminine" && w.g === "f") || (kind === "masculine" && w.g === "m"))).map((w) => w.id);
export const defaultEnabled = () => presetIds("neutral");


// --- Weekend activities. [id, text, from band, to band, when, skies allowed (d dry, s sunny only, w wet, n snow), on by default]
const ACT = [
  ["coffee_walk", "Out for a slow weekend walk with a takeaway coffee, looking around with a relaxed smile.", 0, 6, "day", "dwn", 1],
  ["shopping", "Out shopping, carrying two or three paper shopping bags from different shops.", 0, 6, "day", "dwn", 1],
  ["market", "At a weekend market, a woven basket on one arm with fresh flowers and vegetables.", 2, 6, "day", "d", 1],
  ["bakery", "Back from the bakery with a paper bag of fresh bread and pastries.", 0, 5, "day", "dwn", 1],
  ["picnic", "Heading to a picnic: a small wicker basket in one hand and a folded blanket under the other arm.", 3, 5, "day", "s", 1],
  ["beach", "Heading to the beach: a large beach bag over one shoulder, a rolled towel under the arm, sunglasses on.", 5, 6, "day", "s", 1],
  ["ice_cream", "Enjoying an ice cream cone on a sunny weekend stroll.", 4, 6, "day", "s", 1],
  ["cycling", "Walking a bicycle along, one hand on the handlebars, a helmet hanging from the other hand.", 2, 5, "day", "d", 1],
  ["brunch", "On the way to brunch with friends, relaxed and chatty, a small bag over the shoulder.", 2, 6, "day", "d", 1],
  ["park_book", "Strolling through the park with a paperback book in one hand.", 3, 5, "day", "d", 1],
  ["winter_market", "At a winter market, holding a steaming paper cup of hot chocolate in both hands.", 0, 2, "day", "dn", 1],
  ["snow_sled", "Having fun in the snow, pulling a small wooden sled by its rope.", 0, 1, "day", "n", 1],
  ["dog_walk", "Out for a walk with a friendly medium-sized dog on a leash, the dog trotting ahead on the same base.", 0, 6, "day", "dwn", 0],
  ["dinner_out", "On the way to dinner at a restaurant, a small bag in hand, in a good mood.", 0, 6, "evening", "dwn", 1],
  ["cinema", "On the way to the cinema, a paper bag of popcorn in one hand, looking forward to the film.", 0, 6, "evening", "d", 1],
  ["concert", "Heading to a concert with friends, excited, a small bag across the body.", 0, 6, "evening", "dw", 1],
  ["drinks", "Out for drinks with friends, laughing, a small bag over the shoulder.", 0, 6, "evening", "dw", 1],
  ["house_party", "Going to a house party with a bottle of wine in a paper bag and a small bunch of flowers.", 0, 6, "evening", "d", 1],
  ["takeaway", "Walking home with takeaway food in a paper bag, a happy tired smile.", 0, 6, "evening", "dwn", 1],
];
export const ACTIVITIES = ACT.map(([id, text, lo, hi, when, skies, on]) => ({ id, text, lo, hi, when, skies, on: !!on }));
export const defaultActivities = () => ACTIVITIES.filter((a) => a.on).map((a) => a.id);
const skyLetter = (sky) => (sky === "clear" || sky === "fair" ? "s" : sky === "rain" || sky === "storm" || sky === "hail" || sky === "sleet" ? "w" : sky === "snow" || sky === "snowstorm" ? "n" : "d");
const actFits = (a, band, evening, sky) => band >= a.lo && band <= a.hi && (a.when === "any" || a.when === (evening ? "evening" : "day"))
  && (a.skies.includes(skyLetter(sky)) || (skyLetter(sky) === "s" && a.skies.includes("d")));

// What an outfit needs at each band: [category, probability]. "bottom|dress" = trousers/skirt or a dress.
const PLAN = [
  [["outer", 1], ["top", 1], ["bottom", 1], ["shoes", 1], ["headwear", 1], ["scarf", 1], ["gloves", 1], ["accessory", 0.5]],
  [["outer", 1], ["top", 1], ["bottom", 1], ["shoes", 1], ["scarf", 0.8], ["headwear", 0.5], ["accessory", 0.5]],
  [["outer", 1], ["top", 1], ["bottom|dress", 1], ["shoes", 1], ["scarf", 0.5], ["accessory", 0.6]],
  [["outer", 0.5], ["top", 1], ["bottom|dress", 1], ["shoes", 1], ["accessory", 0.6]],
  [["top", 1], ["bottom|dress", 1], ["shoes", 1], ["headwear", 0.3], ["accessory", 0.6]],
  [["top", 1], ["bottom|dress", 1], ["shoes", 1], ["headwear", 0.4], ["accessory", 0.9]],
  [["top", 1], ["bottom|dress", 1], ["shoes", 1], ["headwear", 0.3], ["accessory", 1]],
];

// groups: the sky groups of the slot (see skyGroups) or null (= ignore weather-specific options, used for the gap check)
function usable(w, band, evening, enabled, groups = null) {
  if (w.sky && !(groups && groups.includes(w.sky))) return false;
  return enabled.has(w.id) && band >= w.lo && band <= w.hi && (w.when === "any" || w.when === (evening ? "evening" : "day"));
}

// Which essential categories have no ticked option for each band (day and evening): [{band, evening, cat}]
export function wardrobeGaps(enabledIds) {
  const enabled = new Set(enabledIds), gaps = [];
  PLAN.forEach((plan, band) => {
    [false, true].forEach((evening) => {
      plan.filter(([, p]) => p === 1).forEach(([cat]) => {
        const cats = cat.split("|");
        if (!cats.some((c) => WARDROBE.some((w) => w.cat === c && usable(w, band, evening, enabled)))) gaps.push({ band: BAND_NAMES[band], evening, cat: cats.join(" or ") });
      });
    });
  });
  return gaps;
}

function rng(seed) {   // small seeded generator: the same slot and seed always give the same outfit
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

// -> { text, missing: [category], cats, picks: [{cat,id,text}], options: {cat: [{id,text}]} }
// sky: the slot's sky; colors: ticked colour ids (null = defaults);
// override: { cat: wardrobe id | "" (= nothing) } chosen by hand for this slot: replaces what the generator picked in that category.
const OUTFIT_ORDER = ["outer", "top", "dress", "bottom", "shoes", "headwear", "scarf", "gloves", "accessory"];
export function composeOutfit(band, evening, enabledIds, seed, sky = "clear", colors = null, skipAccessory = false, only = null, override = null) {
  const enabled = new Set(enabledIds), rand = rng(seed + "|" + band + "|" + evening), missing = [];
  let picks = [];
  const groups = skyGroups(sky), palette = new Set(colors || defaultColors());
  const list = (cat) => WARDROBE.filter((w) => w.cat === cat && usable(w, band, evening, enabled, groups));
  const paint = (w, rnd = rand) => {   // put a colour in front of the garment when it makes sense and one is ticked
    if (!w.role) return w.text;
    const cs = COLORS.filter((c) => palette.has(c.id) && c.roles.includes(w.role));
    if (!cs.length) return w.text;
    const col = cs[Math.floor(rnd() * cs.length)].name;
    const m = /^(an?) (.*)$/.exec(w.text);
    return m ? `${/^[aeiou]/.test(col) ? "an" : "a"} ${col} ${m[2]}` : `${col} ${w.text}`;
  };
  const choose = (cat) => {   // weather-specific options are three times as likely in their weather
    const l = list(cat).filter((w) => !(cat === "headwear" && w.always));
    if (!l.length) return null;
    const weights = l.map((w) => (w.sky ? 3 : 1)), total = weights.reduce((a, b) => a + b, 0);
    let x = rand() * total, i = 0;
    while (i < l.length - 1 && x >= weights[i]) { x -= weights[i]; i++; }
    return { cat, id: l[i].id, text: paint(l[i]) };
  };
  const plan = PLAN[band];
  const always = list("headwear").filter((w) => w.always);   // religious or traditional head coverings: worn in every picture they suit
  let useDress = false;   // a dress replaces top and bottom
  if (plan.some(([c]) => c === "bottom|dress")) {
    const nb = list("bottom").length, nd = list("dress").length;
    useDress = nd > 0 && rand() < nd / (nb + nd);
  }
  if (always.length) { const w = always[Math.floor(rand() * always.length)]; picks.push({ cat: "headwear", id: w.id, text: paint(w) }); }
  for (const [cat, prob] of plan) {
    if (cat === "headwear" && always.length) continue;
    if (only && !cat.split("|").some((c) => only.has(c))) continue;   // e.g. music pictures: indoor clothes only
    if (cat === "accessory" && skipAccessory) continue;   // the weekend activity brings its own props
    if (rand() > prob) continue;
    const c = cat === "bottom|dress" ? (useDress ? "dress" : "bottom") : cat;
    if (useDress && c === "top") continue;
    const t = choose(c);
    if (t) picks.push(t); else if (prob === 1) missing.push(c);
  }
  if (override && Object.keys(override).length) {
    const has = (k) => Object.prototype.hasOwnProperty.call(override, k);
    for (const k of Object.keys(override)) {
      picks = picks.filter((x) => x.cat !== k);
      for (const id of [].concat(override[k] || []).filter(Boolean)) {   // a category can hold several items (accessories add up)
        const w = WARDROBE.find((x) => x.id === id);
        if (w) picks.push({ cat: k, id: w.id, text: paint(w, rng(seed + "|ov|" + w.id)) });
      }
    }
    if (override.dress && !has("top")) picks = picks.filter((x) => x.cat !== "top");
    if (override.dress && !has("bottom")) picks = picks.filter((x) => x.cat !== "bottom");
    if ((override.top || override.bottom) && !has("dress")) picks = picks.filter((x) => x.cat !== "dress");
    picks.sort((a, b) => OUTFIT_ORDER.indexOf(a.cat) - OUTFIT_ORDER.indexOf(b.cat));   // stable: items of one category keep their order
  }
  const cats = picks.map((x) => (x.cat === "headwear" && /glasses/.test(x.text) ? "glasses" : x.cat));
  const options = {};
  for (const c of OUTFIT_ORDER) options[c] = list(c).filter((w) => !(c === "headwear" && w.always)).map((w) => ({ id: w.id, text: w.text }));
  return { text: picks.map((x) => x.text).join(", "), missing, cats, picks, options };
}

const SKY = {
  clear: "A clear sky: relaxed, a small natural smile.",
  cloudy: "An overcast day: calm, neutral expression.",
  wind: "A windy day: hair and clothes blown sideways by the wind, one hand holding down her hair or an item from the outfit.",
  fog: "A foggy day: hands in pockets, collar turned up, a quiet thoughtful look. Do not draw any fog.",
  rain: "Rainy day: a plain dark umbrella held in one hand, the whole umbrella inside the frame; the outfit above is kept exactly as described.",
  storm: "A thunderstorm: the outer layer pulled up around the head (hood or collar up), hunched slightly against the wind and rain, one hand holding it closed. Do not draw rain or lightning.",
  hail: "A hailstorm: hood or collar up, one forearm raised over the head to shield it, body turned away. Do not draw falling hail.",
  sleet: "Cold sleet: a plain dark umbrella in one hand, damp slushy snow on the shoulders, a slight grimace. The whole umbrella inside the frame.",
  snow: "Falling snow: snowflakes settled on the hair and shoulders, a small smile, one hand held out palm-up. Do not draw falling snowflakes.",
  snowstorm: "A snowstorm: head down against the wind, collar or hood up, hands tucked in. Do not draw falling snow.",
  fair: "A dry day: relaxed, a small natural smile.",
  any: "",
};

const BASE_SKY = {
  clear: "dry sun-bleached stone cobbles, pale grey and sand-coloured",
  cloudy: "dry grey stone cobbles under flat light, no cast shadow",
  wind: "dry stone cobbles with a few dry leaves lifting and tumbling at one edge",
  fog: "damp grey paving stones with a faint wet sheen and no puddle",
  rain: "dark wet cobbles with a shallow puddle at one side holding the reflection of the character",
  storm: "dark soaked paving with a deeper puddle, rain rings spreading across it",
  hail: "grey paving scattered with white hailstones",
  sleet: "grey slush over dark wet paving",
  snow: "trodden white snow with a few footprints",
  snowstorm: "windswept white snow with a few footprints",
  fair: "dry stone cobbles, pale grey and sand-coloured",
  any: "stone cobbles",
};

const MOMENT = {
  earlymorning: "Very early morning: soft cool light from one side, a sleepy fresh look, hair a little loose.",
  morning: "Morning: fresh, clear light from one side, a takeaway coffee in one hand.",
  midday: "Midday: bright light from high above, a short soft shadow at the feet, on the base only.",
  afternoon: "Afternoon: warm, slightly golden light from one side.",
  goldenhour: "Golden hour just before sunset: strong warm orange light from one side, shadow falling only across the body and the base (none on the background), warm rim light along the arm and hair.",
  evening: "Evening, out for the night: warm low-angle light from one side, deep soft shadow on the other.",
  lateevening: "Late in the evening, walking home: dim warm street-lamp light from one side, deep shadow on the other, a relaxed tired smile.",
  night: "The middle of the night: very dim warm light from one side, deep shadow elsewhere.",
  day: "Daytime: natural daylight from one side.",
  any: "",
};
const NIGHT_MOMENTS = { evening: 1, lateevening: 1, night: 1 };

const WEEKEND = "It is the weekend: a relaxed, off-duty look, clothes a little more casual than usual, an easy smile, a small casual item (a tote bag or a takeaway coffee).";
const HUMID = "The air is muggy and damp: hair slightly frizzy with damp strands at the temples, a faint sheen on the skin, clothes a little clingy.";

function parts(name) {   // name -> {event, temp, hum, sky, moment, weekend, music}
  const t = name.split("_");
  const music = t[0] === "music";
  if (music) t.shift();
  if (/^\d+$/.test(t[t.length - 1])) t.pop();
  let weekend = false;
  if (t[t.length - 1] === "weekend") { weekend = true; t.pop(); }
  let temp = t.shift(), hum = "any";
  if (temp === "hothumid") { temp = "hot"; hum = "humid"; } else if (temp === "hotdry") temp = "hot";
  else if (t[0] === "humid" || t[0] === "dry" || t[0] === "normal") hum = t.shift() === "humid" ? "humid" : "any";
  const sky = music ? "any" : t.shift();
  const moment = t.shift();
  return { temp, hum, sky, moment, weekend, music };
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

const HEAT_LOOK = "Hair tied up off the neck, a few damp strands clinging, a light natural sheen of sweat on the skin (subtle highlights, not dripping).";
const FREEZE_LOOK = "A faint puff of visible breath.";

// Background instructions: a transparent cut-out (generators such as ChatGPT can do it natively) or a flat colour that is keyed out afterwards.
function bgText(prefs) {
  const noShadow = " No cast shadow, glow or reflection outside the base: the only shadows allowed are on the body, the clothes and the base itself.";
  if (prefs.bg !== "solid") {
    return "BACKGROUND. TRANSPARENT. Deliver a PNG with a real alpha channel: the character and the base are cut out cleanly and everything else is fully transparent (alpha 0). Do not fill the background with any colour, white, grey or checkerboard, and draw no scenery, horizon, gradient, vignette, text, watermark or border. Edges crisp and clean, hair strands cut out properly, with no halo, fringe, glow or semi-transparent haze around the figure." + noShadow + "\n\n";
  }
  const hex = /^#[0-9a-f]{6}$/i.test(prefs.bgColor || "") ? prefs.bgColor.toUpperCase() : "#808080";
  const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const lo = c.map((v) => Math.max(0, v - 15)), hi = c.map((v) => Math.min(255, v + 15));
  const h2 = (a) => "#" + a.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `BACKGROUND. Flat solid colour, exactly ${hex}, completely uniform edge to edge. Nothing else in the frame: no scenery, no horizon, no gradient, no vignette, no text, no watermark, no border. KEY COLOUR. This colour is a chroma key that is removed afterwards, so it must appear ONLY in the background: nothing in the figure may be that colour or close to it. No pixel of the skin, hair, clothes, shoes, accessories or base may fall between ${h2(lo)} and ${h2(hi)} on every channel, whatever the lighting. Where something would be that colour, make it clearly darker or lighter, or give it a visible different tint. Keep the edge between the figure and the background crisp, with no halo, glow, fringe or soft blur. NO SHADOWS ON THE BACKGROUND: the background stays pure ${hex} right up to the edge of the figure and of the base.` + noShadow.replace(" No cast shadow, glow or reflection outside the base: the only", " The only") + "\n\n";
}

// ---------------------------------------------------------------------------------------------------------------
// Music pictures: the character sits in an armchair, headphones on, while music plays.
// ---------------------------------------------------------------------------------------------------------------
const ARMCHAIR = "a plush deep-green corduroy armchair with rounded arms, a thick seat cushion and short dark wooden legs";
const MUSIC_POSE = [
  "curled up sideways with both legs tucked up on the seat",
  "reclining back with both legs stretched out over one armrest",
  "sitting back with one knee drawn up and the other foot resting on the seat",
  "sitting sideways with the legs dangling over one armrest",
];
const MUSIC_MOMENT = {
  earlymorning: "Very early morning: soft cool light from one side, a sleepy peaceful look, hair a little loose.",
  morning: "Morning: fresh clear light from one side, a calm relaxed face.",
  midday: "Midday: bright even light from above, a short soft shadow under the armchair.",
  afternoon: "Afternoon: warm, slightly golden light from one side.",
  goldenhour: "Golden hour: strong warm orange light from one side, warm rim light along the arm and hair, shadow only on the body and the armchair.",
  evening: "Evening at home: warm low light from one side, deep soft shadow on the other, a content smile.",
  lateevening: "Late evening: dim warm lamp light from one side, deep shadow on the other, a drowsy happy look.",
  night: "Late at night: very dim warm light from one side, deep shadow elsewhere, eyes closed, completely relaxed.",
  day: "Daytime: natural light from one side.",
  any: "",
};
// [id, text, when, from band, to band]
const MUSIC_ACT = [
  ["tea", "The character holds a steaming mug of tea in both hands.", "any", 0, 4],
  ["book", "The character is reading an open paperback book held in one hand.", "any", 0, 6],
  ["vinyl", "The character looks at a vinyl record sleeve held in one hand.", "any", 0, 6],
  ["listening", "The character just listens, eyes closed, a content smile, one hand resting on the armrest.", "any", 0, 6],
  ["wine", "The character holds a glass of red wine in one hand.", "evening", 0, 6],
  ["popcorn", "A bowl of popcorn rests on the armrest next to the character.", "evening", 1, 6],
  ["iced", "The character holds a tall glass of iced water with a slice of lemon.", "day", 4, 6],
  ["blanket", "A soft blanket is draped over the character's knees.", "any", 0, 2],
];

function composeMusic(p, name, opts, enabled, style, tail, prefs) {
  const evening = !!NIGHT_MOMENTS[p.moment];
  const band = Math.max(0, BAND_NAMES.indexOf(p.temp === "any" ? "mild" : p.temp));
  const seed = (opts.seed || "") + "|" + name, r = rng(seed + "|music");
  const acts = MUSIC_ACT.filter(([, , when, lo, hi]) => band >= lo && band <= hi && (when === "any" || when === (evening ? "evening" : "day")));
  const act = acts[Math.floor(r() * acts.length)];
  const pose = MUSIC_POSE[Math.floor(r() * MUSIC_POSE.length)];
  // indoor clothes: the ticked tops, bottoms and dresses for this temperature; shoes only to leave beside the armchair
  const o = composeOutfit(band, evening, enabled, seed, "clear", opts.colors || null, true, new Set(["top", "bottom", "dress"]));
  const sh = composeOutfit(band, evening, enabled, seed + "|shoes", "clear", opts.colors || null, true, new Set(["shoes"]));
  const missing = o.missing.slice();
  const bits = [];
  if (o.text) bits.push("At home, the character wears " + o.text + (band >= 5 ? ", light and comfortable" : ", cosy and comfortable") + ", with no coat or jacket.");
  bits.push(evening && sh.text
    ? "The character has taken off the shoes (" + sh.text + ") and left them on the floor next to the armchair, and is barefoot."
    : "The character is barefoot or in soft socks; no shoes on the feet and none in the picture.");
  bits.push("NOT WEARING: no hat or cap, no glasses, no scarf, no gloves, no bag, no jewellery. The only things worn, held or lying near the character are the headphones and what is described here.");
  if (band === 6) bits.push(HEAT_LOOK);
  if (MUSIC_MOMENT[p.moment]) bits.push(MUSIC_MOMENT[p.moment]);
  bits.push(act[1]);
  const text = style +
    "POSE AND FRAMING. The character is seated in " + ARMCHAIR + ", the same armchair in every picture, seen from the side (the armchair from its side, three-quarter view), looking relaxed: " + pose + ". The character wears large cream over-ear headphones and is listening to music, a calm and happy mood. The whole armchair and the whole character are in frame, nothing cropped; they are centred with clear empty margin on all sides and fill about 85% of the image height. Everything held or lying near the character must be entirely inside the frame.\n\n" +
    ((opts._bg ? opts._bg + "\n\n" : bgText(prefs))).replace(/\bbase\b/g, "armchair") +
    "THE ARMCHAIR STANDS ON NOTHING. No floor, no rug, no room, no wall, no window, no furniture, no horizon. Only the armchair, with a soft contact shadow directly under its four legs, and the lowest point of the picture is the bottom of the legs (plus the shoes, if any are described below).\n\n" +
    "NO ATMOSPHERE, NO MUSIC SYMBOLS. Draw no music notes, no sound waves, no visualiser, no glow, no lens flare, no haze. No text or lettering anywhere.\n\n" +
    "THE SCENE. " + bits.join(" ") + tail;
  return { activity: act[0], text, missing };
}

// The parts of a prompt that never change from picture to picture. The Prompt tab lets the user edit each one (stored in avatar.prefs.parts);
// a part left empty uses the default below. {notes} and {surface} are replaced when the prompt is built.
export const PART_KEYS = [
  ["character", "THE CHARACTER", "Text-only prompts. {notes} = the notes written above. With a reference picture the built-in text is used instead."],
  ["style", "STYLE", "Text-only prompts. With a reference picture the built-in text is used instead."],
  ["pose", "POSE AND FRAMING", "Weather pictures (the music armchair has its own)."],
  ["background", "BACKGROUND", "Follows the transparent / solid colour choice below until you edit it."],
  ["base", "BASE", "{surface} = the patch under the feet, chosen from the weather. Weather pictures only."],
  ["noweather", "NO FALLING WEATHER, NO ATMOSPHERE", "Weather pictures only."],
  ["final", "FINAL CHECK", "Closes every prompt; the line “Always add to every prompt” follows it."],
];
export function defaultParts(prefs, textOnly = true) {
  prefs = { ...DEFAULT_PREFS, ...(prefs || {}) };
  return {
    character: "Create a full-length illustration of one character. THE CHARACTER: {notes} Draw exactly this person every time: the same face, hair, skin tone, build and age. The character wears and holds only what is described under THE SCENE below, nothing else.",
    style: "STYLE. A clean, polished digital illustration with soft realistic shading, smooth crisp outlines and natural proportions. Keep the same style, shading, line quality and level of detail in every picture of the series.",
    pose: "POSE AND FRAMING. The character in full, from the top of the head to below the feet, nothing cropped. Side view, walking calmly, facing left, looking ahead. Portrait format, 3:4. The character is centred with clear empty margin on all four sides and fills about 85% of the image height. Everything held or carried must be entirely inside the frame.",
    background: bgText(prefs).trim(),
    base: "BASE. A small patch of {surface}. Shape it as a single low flat ellipse directly under the character, no taller than one step and wide enough for the stride plus a shoulder width on each side. The character stands ON its upper surface with both soles resting on it and a soft contact shadow beneath that stays on the base and never extends past its rim: not sunk into it, not floating above it. The base may run to the bottom edge of the frame. Nothing beyond the base: no ground, no horizon, no buildings, no sky.",
    noweather: "NO FALLING WEATHER, NO ATMOSPHERE. Do not draw falling rain, falling snow, fog, mist, haze, glow or lens flare anywhere in the image.",
    final: "No text, numbers or lettering anywhere. FINAL CHECK before drawing: the outfit matches the description exactly, " + (textOnly ? "" : "nothing is carried over from the reference picture, ") + "the background is as specified.",
  };
}

// opts: { name, prefs, wardrobe (array of ticked ids, or null for the defaults), seed, notes, hasReference }
export function composePrompt(opts) {
  const prefs = { ...DEFAULT_PREFS, ...(opts.prefs || {}) };
  const enabled = opts.wardrobe || defaultEnabled();
  const name = opts.name;
  const textOnly = !!opts.textOnly;   // for engines that take text only: no reference picture is mentioned at all
  const P = defaultParts(prefs, textOnly);
  Object.keys(opts.parts || {}).forEach((k) => { if (k in P && typeof opts.parts[k] === "string" && opts.parts[k].trim()) P[k] = opts.parts[k].trim(); });
  const notesText = opts.notes && opts.notes.trim() ? opts.notes.trim().replace(/\.?$/, ".") : "an adult person.";
  const ref = textOnly
    ? P.character.replace("{notes}", notesText)
    : "Create a new picture of the same character as in the attached reference picture, unchanged: the same face, hair, skin tone, build, age and drawing style. Use the reference ONLY to recognise the person and the style: IGNORE everything else in it (its clothes, hat, glasses, jewellery, bag, pose, expression and background). The character wears and holds only what is described under THE SCENE below, nothing else" +
    (opts.hasReference === false ? " (no reference picture is attached: describe the character yourself in the notes below)" : "") + "." +
    (opts.notes ? " Notes about the character: " + opts.notes.trim() : "");
  const style = ref + "\n\n" + (textOnly ? P.style : "STYLE. Exactly the drawing style of the reference picture: the same shading, line quality and level of detail.") + "\n\n";
  opts = { ...opts, _bg: P.background };
  const head = style + P.pose + "\n\n" + P.background + "\n\n";
  const baseFor = (surface) => P.base.replace("{surface}", surface) + "\n\n" + P.noweather + "\n\nTHE SCENE. ";
  const tail = "\n\n" + P.final + (prefs.extra ? " " + prefs.extra.trim() : "");

  const p = parts(name);
  if (p.music) return composeMusic(p, name, opts, enabled, style, tail, prefs);
  const evening = !!NIGHT_MOMENTS[p.moment];
  const band = Math.max(0, BAND_NAMES.indexOf(p.temp === "any" ? "mild" : p.temp));
  const actOn = new Set(opts.activities || defaultActivities());
  let act = null;
  if (p.weekend) {
    const fits = ACTIVITIES.filter((a) => actOn.has(a.id) && actFits(a, band, evening, p.sky));
    if (fits.length) act = fits[Math.floor(rng((opts.seed || "") + "|act|" + name)() * fits.length)];
  }
  const o = composeOutfit(band, evening, enabled, (opts.seed || "") + "|" + name, p.sky, opts.colors || null, !!act, null, opts.override || null);
  const bits = [];
  if (o.text) bits.push((evening ? "Dressed up to go out: " : "The character wears ") + o.text + ".");
  const has = new Set(o.cats || []), no = [];
  if (!has.has("headwear")) no.push("no hat, cap, beanie, headband or headscarf (hair uncovered, unless a hood is mentioned below)");
  if (!has.has("glasses")) no.push("no glasses or sunglasses");
  if (!has.has("scarf")) no.push("no scarf");
  if (!has.has("gloves")) no.push("no gloves");
  if (!has.has("accessory") && !act) no.push("no bag and nothing carried in the hands apart from what is mentioned below");
  if (no.length) bits.push("NOT WEARING" + (textOnly ? "" : ", even if the reference picture shows them") + ": " + no.join("; ") + ".");
  if (band === 0) bits.push(FREEZE_LOOK);
  if (band === 6) bits.push(HEAT_LOOK);
  if (SKY[p.sky]) bits.push(SKY[p.sky]);
  if (p.hum === "humid") bits.push(HUMID);
  if (MOMENT[p.moment]) bits.push(MOMENT[p.moment]);
  if (p.weekend) bits.push(act ? "It is the weekend, a relaxed off-duty look. " + act.text : WEEKEND);
  const base = BASE_SKY[p.sky] || BASE_SKY.any;
  return { activity: act ? act.id : null, outfit: { picks: o.picks, options: o.options }, text: head + baseFor(base) + bits.join(" ") + tail, missing: o.missing };
}

export type SectorClass = { sector: string; subSector: string }

export const SECTOR_TREE: Record<string, string[]> = {
  'Banking': ['Private Banks', 'Public Sector Banks'],
  'Financial Services': ['NBFCs', 'Housing Finance', 'Lending'],
  'Capital Markets': ['Stockbroking', 'Brokerage', 'Wealth Management', 'Asset Management'],
  'Insurance': ['Life Insurance', 'General Insurance', 'Health Insurance'],
  'IT': ['IT Services', 'Software', 'SaaS', 'IT Consulting'],
  'Automobiles': ['Cars', 'Two-wheelers', 'Commercial Vehicles'],
  'Auto Components': ['Tyres', 'Batteries', 'Auto Parts'],
  'Pharmaceuticals': ['Drug Manufacturers', 'Generic Medicines'],
  'Healthcare': ['Hospitals', 'Diagnostics', 'Medical Services'],
  'FMCG': ['Food', 'Personal Care', 'Household Products'],
  'Consumer Durables': ['Electronics', 'Appliances', 'Electrical Consumer Products'],
  'Consumer Services': ['Retail', 'E-commerce', 'Consumer Platforms'],
  'Oil & Gas': ['Oil Exploration', 'Refining', 'Fuel Distribution'],
  'Energy': ['Power Generation', 'Renewable Energy'],
  'Power': ['Electricity Generation', 'Transmission', 'Distribution'],
  'Metals': ['Steel', 'Aluminium', 'Copper'],
  'Mining': ['Coal', 'Iron Ore', 'Mineral Extraction'],
  'Cement & Building Materials': ['Cement', 'Construction Materials'],
  'Construction & Infrastructure': ['Roads', 'Bridges', 'Engineering Projects'],
  'Capital Goods': ['Industrial Equipment', 'Machinery', 'Electrical Equipment'],
  'Chemicals': ['Specialty Chemicals', 'Industrial Chemicals'],
  'Fertilizers & Agrochemicals': ['Fertilizers', 'Pesticides', 'Crop Protection'],
  'Agriculture': ['Seeds', 'Agricultural Products', 'Farm Inputs'],
  'Real Estate': ['Residential', 'Commercial Property Development'],
  'Telecom': ['Mobile Networks', 'Telecom Infrastructure'],
  'Media & Entertainment': ['Television', 'Film', 'Broadcasting'],
  'Textiles & Apparel': ['Garments', 'Fabrics', 'Textile Manufacturing'],
  'Defence & Aerospace': ['Defence Equipment', 'Aerospace Systems'],
  'Railways': ['Railway Equipment', 'Infrastructure', 'Services'],
  'Logistics': ['Warehousing', 'Transportation', 'Delivery'],
  'Shipping & Ports': ['Port Operations', 'Shipping'],
  'Aviation': ['Airlines', 'Airport Services'],
  'Hotels & Tourism': ['Hotels', 'Resorts', 'Travel Services'],
  'Food & Beverages': ['Food Processing', 'Packaged Foods', 'Beverages'],
  'Paper & Packaging': ['Paper Products', 'Packaging Materials'],
  'Electronics': ['Electronic Components', 'Electronic Manufacturing'],
  'Diversified': ['Companies operating across multiple industries'],
}

export const SECTORS = Object.keys(SECTOR_TREE)

const PSU_BANKS = /\b(sbin|pnb|bankbaroda|canbk|unionbank|indianb|mahabank|centralbk|ucobank|iob|psb|bankindia)\b|(state bank|punjab national|bank of baroda|canara bank|union bank|indian bank|bank of india|bank of maharashtra|uco bank|central bank|indian overseas|punjab & sind|public sector bank|psu bank)/i
const GENERIC_PHRASES = new Set([
  'financial services',
  'consumer cyclical',
  'consumer defensive',
  'consumer discretionary',
  'industrials',
  'basic materials',
  'communication services',
  'unknown',
  'n a',
  'services',
])

export function pickSector(sector: string, subSector: string): SectorClass {
  const subs = SECTOR_TREE[sector]
  if (!subs) return { sector: 'Diversified', subSector: SECTOR_TREE.Diversified[0] }
  return { sector, subSector: subs.includes(subSector) ? subSector : subs[0] }
}

function norm(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[—–−_/|,().'+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const INDUSTRY_MAP: Record<string, SectorClass> = {
  'capital markets': pickSector('Capital Markets', 'Stockbroking'),
  'investment banking and brokerage': pickSector('Capital Markets', 'Brokerage'),
  'investment banking': pickSector('Capital Markets', 'Brokerage'),
  'financial data and stock exchanges': pickSector('Capital Markets', 'Stockbroking'),
  'financial data': pickSector('Capital Markets', 'Stockbroking'),
  'stock exchanges': pickSector('Capital Markets', 'Stockbroking'),
  'asset management': pickSector('Capital Markets', 'Asset Management'),
  'asset management and custody banks': pickSector('Capital Markets', 'Asset Management'),
  'credit services': pickSector('Financial Services', 'Lending'),
  'mortgage finance': pickSector('Financial Services', 'Housing Finance'),
  'financial conglomerates': pickSector('Financial Services', 'NBFCs'),
  'banks diversified': pickSector('Banking', 'Private Banks'),
  'banks regional': pickSector('Banking', 'Private Banks'),
  'banks': pickSector('Banking', 'Private Banks'),
  'insurance diversified': pickSector('Insurance', 'General Insurance'),
  'insurance life': pickSector('Insurance', 'Life Insurance'),
  'insurance property and casualty': pickSector('Insurance', 'General Insurance'),
  'insurance reinsurance': pickSector('Insurance', 'General Insurance'),
  'insurance specialty': pickSector('Insurance', 'General Insurance'),
  'insurance brokers': pickSector('Insurance', 'General Insurance'),
  'information technology services': pickSector('IT', 'IT Services'),
  'software application': pickSector('IT', 'Software'),
  'software infrastructure': pickSector('IT', 'SaaS'),
  'software': pickSector('IT', 'Software'),
  'it services': pickSector('IT', 'IT Services'),
  'information technology': pickSector('IT', 'IT Services'),
  'technology': pickSector('IT', 'IT Services'),
  'semiconductors': pickSector('Electronics', 'Electronic Components'),
  'semiconductor equipment and materials': pickSector('Electronics', 'Electronic Components'),
  'electronic components': pickSector('Electronics', 'Electronic Components'),
  'electronics and computer distribution': pickSector('Electronics', 'Electronic Manufacturing'),
  'computer hardware': pickSector('Electronics', 'Electronic Manufacturing'),
  'communication equipment': pickSector('Telecom', 'Telecom Infrastructure'),
  'scientific and technical instruments': pickSector('Electronics', 'Electronic Components'),
  'consumer electronics': pickSector('Consumer Durables', 'Electronics'),
  'auto manufacturers': pickSector('Automobiles', 'Cars'),
  'auto and truck dealerships': pickSector('Automobiles', 'Cars'),
  'auto parts': pickSector('Auto Components', 'Auto Parts'),
  'automobile and auto components': pickSector('Automobiles', 'Cars'),
  'recreational vehicles': pickSector('Automobiles', 'Cars'),
  'drug manufacturers general': pickSector('Pharmaceuticals', 'Drug Manufacturers'),
  'drug manufacturers specialty and generic': pickSector('Pharmaceuticals', 'Generic Medicines'),
  'biotechnology': pickSector('Pharmaceuticals', 'Drug Manufacturers'),
  'medical care facilities': pickSector('Healthcare', 'Hospitals'),
  'diagnostics and research': pickSector('Healthcare', 'Diagnostics'),
  'medical devices': pickSector('Healthcare', 'Medical Services'),
  'medical instruments and supplies': pickSector('Healthcare', 'Medical Services'),
  'medical distribution': pickSector('Healthcare', 'Medical Services'),
  'health information services': pickSector('Healthcare', 'Medical Services'),
  'pharmaceutical retailers': pickSector('Healthcare', 'Medical Services'),
  'internet retail': pickSector('Consumer Services', 'E-commerce'),
  'department stores': pickSector('Consumer Services', 'Retail'),
  'specialty retail': pickSector('Consumer Services', 'Retail'),
  'apparel retail': pickSector('Consumer Services', 'Retail'),
  'home improvement retail': pickSector('Consumer Services', 'Retail'),
  'discount stores': pickSector('Consumer Services', 'Retail'),
  'grocery stores': pickSector('Consumer Services', 'Retail'),
  'internet content and information': pickSector('Consumer Services', 'Consumer Platforms'),
  'furnishings fixtures and appliances': pickSector('Consumer Durables', 'Appliances'),
  'luxury goods': pickSector('Consumer Durables', 'Electronics'),
  'household and personal products': pickSector('FMCG', 'Personal Care'),
  'packaged foods': pickSector('Food & Beverages', 'Packaged Foods'),
  'confectioners': pickSector('Food & Beverages', 'Packaged Foods'),
  'food distribution': pickSector('Food & Beverages', 'Food Processing'),
  'beverages non alcoholic': pickSector('Food & Beverages', 'Beverages'),
  'beverages brewers': pickSector('Food & Beverages', 'Beverages'),
  'beverages wineries and distilleries': pickSector('Food & Beverages', 'Beverages'),
  'farm products': pickSector('Agriculture', 'Agricultural Products'),
  'education and training services': pickSector('Consumer Services', 'Consumer Platforms'),
  'personal services': pickSector('Consumer Services', 'Retail'),
  'tobacco': pickSector('FMCG', 'Personal Care'),
  'fast moving consumer goods': pickSector('FMCG', 'Food'),
  'consumer durables': pickSector('Consumer Durables', 'Electronics'),
  'oil and gas e p': pickSector('Oil & Gas', 'Oil Exploration'),
  'oil and gas drilling': pickSector('Oil & Gas', 'Oil Exploration'),
  'oil and gas integrated': pickSector('Oil & Gas', 'Refining'),
  'oil and gas refining and marketing': pickSector('Oil & Gas', 'Refining'),
  'oil and gas midstream': pickSector('Oil & Gas', 'Fuel Distribution'),
  'oil and gas equipment and services': pickSector('Oil & Gas', 'Fuel Distribution'),
  'oil gas and consumable fuels': pickSector('Oil & Gas', 'Fuel Distribution'),
  'thermal coal': pickSector('Mining', 'Coal'),
  'coking coal': pickSector('Mining', 'Coal'),
  'uranium': pickSector('Mining', 'Mineral Extraction'),
  'solar': pickSector('Energy', 'Renewable Energy'),
  'utilities independent power producers': pickSector('Energy', 'Power Generation'),
  'utilities renewable': pickSector('Energy', 'Renewable Energy'),
  'utilities regulated electric': pickSector('Power', 'Electricity Generation'),
  'utilities diversified': pickSector('Power', 'Electricity Generation'),
  'utilities regulated gas': pickSector('Oil & Gas', 'Fuel Distribution'),
  'utilities regulated water': pickSector('Power', 'Distribution'),
  'steel': pickSector('Metals', 'Steel'),
  'aluminum': pickSector('Metals', 'Aluminium'),
  'aluminium': pickSector('Metals', 'Aluminium'),
  'copper': pickSector('Metals', 'Copper'),
  'gold': pickSector('Mining', 'Mineral Extraction'),
  'silver': pickSector('Mining', 'Mineral Extraction'),
  'other industrial metals and mining': pickSector('Mining', 'Mineral Extraction'),
  'other precious metals and mining': pickSector('Mining', 'Mineral Extraction'),
  'metals and mining': pickSector('Metals', 'Steel'),
  'building materials': pickSector('Cement & Building Materials', 'Construction Materials'),
  'construction materials': pickSector('Cement & Building Materials', 'Construction Materials'),
  'lumber and wood production': pickSector('Cement & Building Materials', 'Construction Materials'),
  'forest materials': pickSector('Paper & Packaging', 'Paper Products'),
  'engineering and construction': pickSector('Construction & Infrastructure', 'Engineering Projects'),
  'infrastructure operations': pickSector('Construction & Infrastructure', 'Engineering Projects'),
  'building products and equipment': pickSector('Cement & Building Materials', 'Construction Materials'),
  'farm and heavy construction machinery': pickSector('Capital Goods', 'Machinery'),
  'specialty industrial machinery': pickSector('Capital Goods', 'Machinery'),
  'industrial distribution': pickSector('Capital Goods', 'Industrial Equipment'),
  'electrical equipment and parts': pickSector('Capital Goods', 'Electrical Equipment'),
  'tools and accessories': pickSector('Capital Goods', 'Industrial Equipment'),
  'metal fabrication': pickSector('Capital Goods', 'Industrial Equipment'),
  'pollution and treatment controls': pickSector('Capital Goods', 'Industrial Equipment'),
  'business equipment and supplies': pickSector('Capital Goods', 'Industrial Equipment'),
  'capital goods': pickSector('Capital Goods', 'Machinery'),
  'aerospace and defense': pickSector('Defence & Aerospace', 'Defence Equipment'),
  'railroads': pickSector('Railways', 'Infrastructure'),
  'airlines': pickSector('Aviation', 'Airlines'),
  'airports and air services': pickSector('Aviation', 'Airport Services'),
  'marine shipping': pickSector('Shipping & Ports', 'Shipping'),
  'integrated freight and logistics': pickSector('Logistics', 'Transportation'),
  'trucking': pickSector('Logistics', 'Transportation'),
  'waste management': pickSector('Logistics', 'Warehousing'),
  'chemicals': pickSector('Chemicals', 'Industrial Chemicals'),
  'specialty chemicals': pickSector('Chemicals', 'Specialty Chemicals'),
  'agricultural inputs': pickSector('Fertilizers & Agrochemicals', 'Fertilizers'),
  'paper and paper products': pickSector('Paper & Packaging', 'Paper Products'),
  'packaging and containers': pickSector('Paper & Packaging', 'Packaging Materials'),
  'real estate development': pickSector('Real Estate', 'Residential'),
  'real estate diversified': pickSector('Real Estate', 'Commercial Property Development'),
  'real estate services': pickSector('Real Estate', 'Commercial Property Development'),
  'residential construction': pickSector('Real Estate', 'Residential'),
  'realty': pickSector('Real Estate', 'Residential'),
  'reit diversified': pickSector('Real Estate', 'Commercial Property Development'),
  'reit office': pickSector('Real Estate', 'Commercial Property Development'),
  'reit retail': pickSector('Real Estate', 'Commercial Property Development'),
  'reit residential': pickSector('Real Estate', 'Residential'),
  'reit industrial': pickSector('Real Estate', 'Commercial Property Development'),
  'reit hotel and motel': pickSector('Hotels & Tourism', 'Hotels'),
  'reit healthcare facilities': pickSector('Healthcare', 'Hospitals'),
  'reit specialty': pickSector('Real Estate', 'Commercial Property Development'),
  'telecom services': pickSector('Telecom', 'Mobile Networks'),
  'telecommunication': pickSector('Telecom', 'Mobile Networks'),
  'entertainment': pickSector('Media & Entertainment', 'Film'),
  'broadcasting': pickSector('Media & Entertainment', 'Broadcasting'),
  'publishing': pickSector('Media & Entertainment', 'Broadcasting'),
  'electronic gaming and multimedia': pickSector('Media & Entertainment', 'Broadcasting'),
  'advertising agencies': pickSector('Media & Entertainment', 'Broadcasting'),
  'media entertainment and publication': pickSector('Media & Entertainment', 'Broadcasting'),
  'apparel manufacturing': pickSector('Textiles & Apparel', 'Garments'),
  'textile manufacturing': pickSector('Textiles & Apparel', 'Textile Manufacturing'),
  'textiles': pickSector('Textiles & Apparel', 'Textile Manufacturing'),
  'footwear and accessories': pickSector('Textiles & Apparel', 'Garments'),
  'lodging': pickSector('Hotels & Tourism', 'Hotels'),
  'resorts and casinos': pickSector('Hotels & Tourism', 'Resorts'),
  'travel services': pickSector('Hotels & Tourism', 'Travel Services'),
  'restaurants': pickSector('Hotels & Tourism', 'Travel Services'),
  'conglomerates': pickSector('Diversified', SECTOR_TREE.Diversified[0]),
  'shell companies': pickSector('Diversified', SECTOR_TREE.Diversified[0]),
  'consulting services': pickSector('IT', 'IT Consulting'),
  'rental and leasing services': pickSector('Financial Services', 'NBFCs'),
  'staffing and employment services': pickSector('Consumer Services', 'Consumer Platforms'),
  'specialty business services': pickSector('Consumer Services', 'Consumer Platforms'),
  'security and protection services': pickSector('Consumer Services', 'Consumer Platforms'),
}

const INDUSTRY_KEYS = Object.keys(INDUSTRY_MAP).sort((a, b) => b.length - a.length)

function mapPhrase(phrase: string): SectorClass | null {
  if (!phrase || GENERIC_PHRASES.has(phrase)) return null
  const exact = INDUSTRY_MAP[phrase]
  if (exact) return exact
  const key = INDUSTRY_KEYS.find((item) => phrase === item || phrase.includes(item))
  return key ? INDUSTRY_MAP[key] : null
}

function capitalMarketSub(identity: string, fallback: string): string {
  if (/(amc|asset management|mutual fund|cams|kfin|registrar|custod)/.test(identity)) return 'Asset Management'
  if (/(wealth|\bwam\b|portfolio management)/.test(identity)) return 'Wealth Management'
  if (/(broker|broking|securities|exchange|depository|cdsl|nsdl)/.test(identity)) return 'Stockbroking'
  return fallback
}

function refine(mapped: SectorClass, identity: string): SectorClass {
  if (mapped.sector === 'Capital Markets') {
    return pickSector('Capital Markets', capitalMarketSub(identity, mapped.subSector))
  }
  if (mapped.sector === 'Banking') {
    return pickSector('Banking', PSU_BANKS.test(identity) ? 'Public Sector Banks' : 'Private Banks')
  }
  if (mapped.sector === 'Automobiles' && /(two[- ]wheel|motorcycle|scooter|hero motocorp|eicher|bajaj auto)/.test(identity)) {
    return pickSector('Automobiles', 'Two-wheelers')
  }
  if (mapped.sector === 'Automobiles' && /(commercial vehicle|ashok leyland|eicher motors)/.test(identity)) {
    return pickSector('Automobiles', 'Commercial Vehicles')
  }
  return mapped
}

function keywordClassify(text: string): SectorClass {
  if (!text.trim()) return pickSector('Diversified', SECTOR_TREE.Diversified[0])

  if (/(life insurance)/.test(text)) return pickSector('Insurance', 'Life Insurance')
  if (/(health insurance|mediclaim)/.test(text)) return pickSector('Insurance', 'Health Insurance')
  if (/(general insurance|non-life insurance|\binsurance\b)/.test(text)) return pickSector('Insurance', 'General Insurance')

  if (/\b(banks?|banking)\b/.test(text) && !/(non[- ]bank|nbfc)/.test(text)) {
    return pickSector('Banking', PSU_BANKS.test(text) ? 'Public Sector Banks' : 'Private Banks')
  }
  if (/(housing finance|mortgage|home loan)/.test(text)) return pickSector('Financial Services', 'Housing Finance')
  if (/(nbfc|non[- ]bank)/.test(text)) return pickSector('Financial Services', 'NBFCs')
  if (/(asset management|mutual fund|\bcams\b|kfin|registrar)/.test(text)) return pickSector('Capital Markets', 'Asset Management')
  if (/(wealth management|\bwam\b)/.test(text)) return pickSector('Capital Markets', 'Wealth Management')
  if (/(stock ?broker|stock broking|broking|discount broker)/.test(text)) return pickSector('Capital Markets', 'Stockbroking')
  if (/(brokerage)/.test(text)) return pickSector('Capital Markets', 'Brokerage')
  if (/(capital markets?)/.test(text)) return pickSector('Capital Markets', capitalMarketSub(text, 'Stockbroking'))
  if (/(lending|credit services|consumer finance)/.test(text)) return pickSector('Financial Services', 'Lending')

  if (/(saas|software-as-a-service)/.test(text)) return pickSector('IT', 'SaaS')
  if (/(it consulting)/.test(text)) return pickSector('IT', 'IT Consulting')
  if (/(application software|software)/.test(text) && !/broking|broker/.test(text)) return pickSector('IT', 'Software')
  if (/(information technology|\bit services\b)/.test(text) && !/biotech|agrotech/.test(text)) return pickSector('IT', 'IT Services')

  if (/(tyre)/.test(text)) return pickSector('Auto Components', 'Tyres')
  if (/(batter)/.test(text) && /auto/.test(text)) return pickSector('Auto Components', 'Batteries')
  if (/(auto part|auto component)/.test(text)) return pickSector('Auto Components', 'Auto Parts')
  if (/(two[- ]wheel|motorcycle|scooter)/.test(text)) return pickSector('Automobiles', 'Two-wheelers')
  if (/(commercial vehicle|ashok leyland)/.test(text)) return pickSector('Automobiles', 'Commercial Vehicles')
  if (/(auto manufacturer|automobile|passenger vehicle)/.test(text)) return pickSector('Automobiles', 'Cars')

  if (/(generic)/.test(text) && /(pharma|drug|medicine)/.test(text)) return pickSector('Pharmaceuticals', 'Generic Medicines')
  if (/(pharma|drug manufacturer|biotech)/.test(text)) return pickSector('Pharmaceuticals', 'Drug Manufacturers')
  if (/(hospital)/.test(text)) return pickSector('Healthcare', 'Hospitals')
  if (/(diagnostic)/.test(text)) return pickSector('Healthcare', 'Diagnostics')
  if (/(healthcare|medical care|medical device)/.test(text)) return pickSector('Healthcare', 'Medical Services')

  if (/(e-?commerce|internet retail)/.test(text)) return pickSector('Consumer Services', 'E-commerce')
  if (/(consumer platform)/.test(text)) return pickSector('Consumer Services', 'Consumer Platforms')
  if (/(department store|\bretail\b)/.test(text)) return pickSector('Consumer Services', 'Retail')
  if (/(personal care|cosmetics|toiletr)/.test(text)) return pickSector('FMCG', 'Personal Care')
  if (/(household product)/.test(text)) return pickSector('FMCG', 'Household Products')
  if (/(packaged food|\bfmcg\b)/.test(text)) return pickSector('FMCG', 'Food')
  if (/(beverage|soft drink|liquor)/.test(text)) return pickSector('Food & Beverages', 'Beverages')
  if (/(food processing)/.test(text)) return pickSector('Food & Beverages', 'Food Processing')
  if (/(packaged foods)/.test(text)) return pickSector('Food & Beverages', 'Packaged Foods')
  if (/(appliance|white good|sanitary)/.test(text)) return pickSector('Consumer Durables', 'Appliances')
  if (/(consumer electronic|consumer durable)/.test(text)) return pickSector('Consumer Durables', 'Electronics')

  if (/(explor)/.test(text) && /(oil|gas)/.test(text)) return pickSector('Oil & Gas', 'Oil Exploration')
  if (/(refin)/.test(text)) return pickSector('Oil & Gas', 'Refining')
  if (/(oil and gas|oil & gas|petroleum)/.test(text)) return pickSector('Oil & Gas', 'Fuel Distribution')
  if (/(renewable|solar|wind energy|green energy)/.test(text)) return pickSector('Energy', 'Renewable Energy')
  if (/(power generation|independent power)/.test(text)) return pickSector('Energy', 'Power Generation')
  if (/(transmission)/.test(text) && /power|electric/.test(text)) return pickSector('Power', 'Transmission')
  if (/(distribution)/.test(text) && /power|electric/.test(text)) return pickSector('Power', 'Distribution')
  if (/(utilities|\bpower\b)/.test(text) && !/automobile|auto part|software/.test(text)) return pickSector('Power', 'Electricity Generation')

  if (/(steel)/.test(text)) return pickSector('Metals', 'Steel')
  if (/(aluminium|aluminum)/.test(text)) return pickSector('Metals', 'Aluminium')
  if (/(copper)/.test(text)) return pickSector('Metals', 'Copper')
  if (/(coal)/.test(text)) return pickSector('Mining', 'Coal')
  if (/(iron ore)/.test(text)) return pickSector('Mining', 'Iron Ore')
  if (/(mining|mineral)/.test(text)) return pickSector('Mining', 'Mineral Extraction')
  if (/(cement)/.test(text)) return pickSector('Cement & Building Materials', 'Cement')
  if (/(building material|construction material)/.test(text)) return pickSector('Cement & Building Materials', 'Construction Materials')

  if (/(defence|defense|aerospace)/.test(text)) return pickSector('Defence & Aerospace', /aero/.test(text) ? 'Aerospace Systems' : 'Defence Equipment')
  if (/(railway|railroad)/.test(text)) return pickSector('Railways', /equip/.test(text) ? 'Railway Equipment' : /service/.test(text) ? 'Services' : 'Infrastructure')
  if (/(port )/.test(text)) return pickSector('Shipping & Ports', 'Port Operations')
  if (/(shipping|marine)/.test(text)) return pickSector('Shipping & Ports', 'Shipping')
  if (/(airline|aviation|airport)/.test(text)) return pickSector('Aviation', /airport/.test(text) ? 'Airport Services' : 'Airlines')
  if (/(warehouse)/.test(text)) return pickSector('Logistics', 'Warehousing')
  if (/(delivery|courier)/.test(text)) return pickSector('Logistics', 'Delivery')
  if (/(logistics|freight|transport)/.test(text)) return pickSector('Logistics', 'Transportation')

  if (/(highway|road construction)/.test(text)) return pickSector('Construction & Infrastructure', 'Roads')
  if (/(engineering and construction|infrastructure|construction)/.test(text)) return pickSector('Construction & Infrastructure', 'Engineering Projects')
  if (/(electrical equipment|cable|wire)/.test(text)) return pickSector('Capital Goods', 'Electrical Equipment')
  if (/(industrial equipment)/.test(text)) return pickSector('Capital Goods', 'Industrial Equipment')
  if (/(machinery|capital goods)/.test(text)) return pickSector('Capital Goods', 'Machinery')

  if (/(fertilizer)/.test(text)) return pickSector('Fertilizers & Agrochemicals', 'Fertilizers')
  if (/(pesticide)/.test(text)) return pickSector('Fertilizers & Agrochemicals', 'Pesticides')
  if (/(agrochemical|crop protection)/.test(text)) return pickSector('Fertilizers & Agrochemicals', 'Crop Protection')
  if (/(seed)/.test(text)) return pickSector('Agriculture', 'Seeds')
  if (/(farm input)/.test(text)) return pickSector('Agriculture', 'Farm Inputs')
  if (/(agriculture|agricultural)/.test(text)) return pickSector('Agriculture', 'Agricultural Products')
  if (/(specialty chemical)/.test(text)) return pickSector('Chemicals', 'Specialty Chemicals')
  if (/(chemical)/.test(text)) return pickSector('Chemicals', 'Industrial Chemicals')

  if (/(real estate|realty)/.test(text)) return pickSector('Real Estate', /commercial/.test(text) ? 'Commercial Property Development' : 'Residential')
  if (/(telecom infra|tower)/.test(text)) return pickSector('Telecom', 'Telecom Infrastructure')
  if (/(telecom|mobile network)/.test(text)) return pickSector('Telecom', 'Mobile Networks')
  if (/(television|\btv\b)/.test(text)) return pickSector('Media & Entertainment', 'Television')
  if (/(film|movie)/.test(text)) return pickSector('Media & Entertainment', 'Film')
  if (/(broadcast|media|entertainment)/.test(text)) return pickSector('Media & Entertainment', 'Broadcasting')
  if (/(garment|apparel)/.test(text)) return pickSector('Textiles & Apparel', 'Garments')
  if (/(fabric)/.test(text)) return pickSector('Textiles & Apparel', 'Fabrics')
  if (/(textile)/.test(text)) return pickSector('Textiles & Apparel', 'Textile Manufacturing')
  if (/(hotel)/.test(text)) return pickSector('Hotels & Tourism', 'Hotels')
  if (/(resort)/.test(text)) return pickSector('Hotels & Tourism', 'Resorts')
  if (/(travel|tourism|lodging)/.test(text)) return pickSector('Hotels & Tourism', 'Travel Services')
  if (/(packaging)/.test(text)) return pickSector('Paper & Packaging', 'Packaging Materials')
  if (/(paper)/.test(text)) return pickSector('Paper & Packaging', 'Paper Products')
  if (/(electronic component)/.test(text)) return pickSector('Electronics', 'Electronic Components')
  if (/(electronic manufacturing)/.test(text)) return pickSector('Electronics', 'Electronic Manufacturing')
  if (/(conglomerate|diversified)/.test(text)) return pickSector('Diversified', SECTOR_TREE.Diversified[0])

  const exact = SECTORS.find((sector) => text.includes(norm(sector)))
  if (exact && exact !== 'Financial Services') return pickSector(exact, SECTOR_TREE[exact][0])
  return pickSector('Diversified', SECTOR_TREE.Diversified[0])
}

export function classifyStock(input: {
  industry?: string | null
  sector?: string | null
  name?: string | null
  symbol?: string | null
  summary?: string | null
}): SectorClass {
  const industry = norm(input.industry)
  const sector = norm(input.sector)
  const identity = norm(`${input.symbol ?? ''} ${input.name ?? ''}`)
  const summary = norm(input.summary)

  const fromIndustry = mapPhrase(industry)
  if (fromIndustry) return refine(fromIndustry, identity)

  const fromSummary = summary ? keywordClassify(`${identity} ${summary}`) : null
  if (fromSummary && fromSummary.sector !== 'Diversified') return fromSummary

  const fromIdentity = identity ? keywordClassify(identity) : null
  if (fromIdentity && fromIdentity.sector !== 'Diversified') return fromIdentity

  const fromSector = mapPhrase(sector)
  if (fromSector) return refine(fromSector, identity)

  return keywordClassify([industry, sector, identity, summary].filter(Boolean).join(' '))
}

/**
 * GlideMind - European Curated Spots Ingestion & Catalog Enrichment
 * 
 * Ingests validated paragliding and hang gliding comprensori for France, Switzerland,
 * Austria, and Germany into data/locations.json, then runs sharding.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSharding } from './shard-locations-catalog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCATIONS_FILE = path.resolve(__dirname, '../data/locations.json');

export const CURATED_FRENCH_SPOTS = {
  "Auvergne-Rhône-Alpes": [
    {
      location: "Annecy - Col de la Forclaz (Montmin - 74)",
      description: "Il sito di volo libero più rinomato d'Europa con vista sul lago di Annecy, termiche costanti e atterraggio ufficiale a Doussard.",
      takeoffs: [
        {
          name: "Col de la Forclaz (Montmin)",
          coordinates: "45.811600, 6.246400",
          altitude: 1280,
          heading: 290,
          description: "Decollo ufficiale FFVL erboso con moquette, esposizione Ovest/Nord-Ovest verso il lago di Annecy.",
          reliability: 95
        },
        {
          name: "Planfait",
          coordinates: "45.850500, 6.221200",
          altitude: 960,
          heading: 250,
          description: "Decollo pomeridiano molto attivo con brezza di valle e moquette.",
          reliability: 92
        }
      ],
      landings: [
        {
          name: "Doussard (Bout du Lac)",
          coordinates: "45.782500, 6.223800",
          altitude: 460,
          description: "Grande campo ufficiale FFVL con manica a vento e parcheggio dedicato.",
          reliability: 95
        },
        {
          name: "Perroix (Talloires)",
          coordinates: "45.845800, 6.216300",
          altitude: 540,
          description: "Atterraggio ufficiale sotto Planfait con bar e scuola di volo.",
          reliability: 92
        }
      ],
      reliability: 95
    },
    {
      location: "Chamonix - Mont Blanc (Planpraz - 74)",
      description: "Volo d'alta montagna al cospetto del massiccio del Monte Bianco con decollo da Planpraz e Flégère.",
      takeoffs: [
        {
          name: "Planpraz (Brévent)",
          coordinates: "45.936100, 6.852200",
          altitude: 2000,
          heading: 160,
          description: "Decollo accessibile con la cabinovia del Brévent, vista frontale sul Monte Bianco.",
          reliability: 94
        },
        {
          name: "Décollage de la Flégère",
          coordinates: "45.968332, 6.876707",
          altitude: 1890,
          heading: 150,
          description: "Decollo FFVL della Flégère servito da funivia, ottimo punto di partenza per cross verso Vallorcine.",
          reliability: 90
        }
      ],
      landings: [
        {
          name: "Bois du Bouchet (Chamonix)",
          coordinates: "45.928800, 6.879100",
          altitude: 1040,
          description: "Atterraggio ufficiale a monte del centro abitato di Chamonix con manica a vento.",
          reliability: 94
        }
      ],
      reliability: 94
    },
    {
      location: "Saint-Hilaire du Touvet (Coupe Icare - 38)",
      description: "Culla del volo libero francese e sede della Coupe Icare, sulla falesia orientale del massiccio della Chartreuse.",
      takeoffs: [
        {
          name: "Décollage Sud (Moquette)",
          coordinates: "45.306100, 5.886600",
          altitude: 960,
          heading: 100,
          description: "Falesia attrezzata con moquette, decollo facilitato con regime di brezza da est.",
          reliability: 95
        },
        {
          name: "Décollage Est",
          coordinates: "45.308000, 5.889000",
          altitude: 1000,
          heading: 90,
          description: "Decollo alto adiacente alla stazione della funicolare.",
          reliability: 92
        }
      ],
      landings: [
        {
          name: "Lumbin",
          coordinates: "45.298200, 5.918900",
          altitude: 240,
          description: "Vasto atterraggio nella valle del Grésivaudan con ampio parcheggio e club house.",
          reliability: 95
        }
      ],
      reliability: 95
    },
    {
      location: "Passy - Plaine-Joux (Mont Blanc - 74)",
      description: "Balcone soleggiato di fronte alla catena del Monte Bianco con decollo dolcemente inclinato ed atterraggio a valle.",
      takeoffs: [
        {
          name: "Plaine-Joux",
          coordinates: "45.950000, 6.740000",
          altitude: 1360,
          heading: 190,
          description: "Decollo erboso ideale per principianti e termiche generose sui costoni rocciosi.",
          reliability: 93
        }
      ],
      landings: [
        {
          name: "Marlioz Passy (Chedde)",
          coordinates: "45.916700, 6.690000",
          altitude: 580,
          description: "Atterraggio ufficiale in fondovalle con manica a vento ben visibile.",
          reliability: 92
        }
      ],
      reliability: 93
    },
    {
      location: "Samoëns - Grand Massif (Haute-Savoie - 74)",
      description: "Volo panoramica nella valle del Giffre con decollo da La Bourgeoise e dal Plateau des Saix.",
      takeoffs: [
        {
          name: "La Bourgeoise",
          coordinates: "46.114985, 6.719794",
          altitude: 1770,
          heading: 200,
          description: "Decollo erboso con vista sul Monte Bianco e valle del Giffre.",
          reliability: 91
        },
        {
          name: "Plateau des Saix",
          coordinates: "46.068200, 6.702500",
          altitude: 1600,
          heading: 340,
          description: "Decollo invernale ed estivo servito da impianti.",
          reliability: 88
        }
      ],
      landings: [
        {
          name: "Samoëns Piscine",
          coordinates: "46.079200, 6.721400",
          altitude: 690,
          description: "Atterraggio ufficiale adiacente agli impianti sportivi comunali.",
          reliability: 91
        }
      ],
      reliability: 91
    },
    {
      location: "Thollon-les-Mémises (Lac Léman - 74)",
      description: "Decollo a picco sul lago di Ginevra con brezza lacustre e termodinamica lungo le creste delle Mémises.",
      takeoffs: [
        {
          name: "Les Mémises",
          coordinates: "46.380052, 6.724839",
          altitude: 1620,
          heading: 350,
          description: "Decollo FFVL servito dalla telecabina di Thollon, orientamento Nord verso il lago.",
          reliability: 90
        }
      ],
      landings: [
        {
          name: "Les Vernes (Thollon)",
          coordinates: "46.394345, 6.702708",
          altitude: 870,
          description: "Atterraggio ufficiale a metà costa tra monte e lago.",
          reliability: 90
        }
      ],
      reliability: 90
    },
    {
      location: "Morzine - Avoriaz (Haute-Savoie - 74)",
      description: "Comprensorio alpino dell'alta Savoia collegato al domaine Portes du Soleil.",
      takeoffs: [
        {
          name: "Super Morzine",
          coordinates: "46.191047, 6.722306",
          altitude: 1650,
          heading: 260,
          description: "Decollo raggiungibile con ovovia, orientamento Ovest.",
          reliability: 89
        }
      ],
      landings: [
        {
          name: "Morzine Puthey",
          coordinates: "46.178840, 6.715986",
          altitude: 980,
          description: "Atterraggio ufficiale vicino al centro fondo di Morzine.",
          reliability: 89
        }
      ],
      reliability: 89
    },
    {
      location: "Châtel - Portes du Soleil (Haute-Savoie - 74)",
      description: "Comprensorio transfrontaliero al confine con la Svizzera (valle d'Abondance).",
      takeoffs: [
        {
          name: "Châtel Morclan",
          coordinates: "46.276573, 6.857341",
          altitude: 1950,
          heading: 270,
          description: "Decollo alto sotto la cima del Morclan.",
          reliability: 88
        }
      ],
      landings: [
        {
          name: "Châtel l'Ortaz",
          coordinates: "46.283033, 6.840033",
          altitude: 1200,
          heading: 180,
          description: "Atterraggio in fondovalle con manica a vento.",
          reliability: 88
        }
      ],
      reliability: 88
    },
    {
      location: "Montlambert (Savoie - 73)",
      description: "Punto di partenza classico per grandi voli di distanza lungo la combe de Savoie.",
      takeoffs: [
        {
          name: "Montlambert",
          coordinates: "45.549200, 6.136700",
          altitude: 650,
          heading: 190,
          description: "Decollo termico ad attivazione precoce al mattino.",
          reliability: 92
        }
      ],
      landings: [
        {
          name: "Saint-Pierre d'Albigny",
          coordinates: "45.558300, 6.155000",
          altitude: 280,
          description: "Ampio atterraggio in valle con parcheggio e club house.",
          reliability: 92
        }
      ],
      reliability: 92
    },
    {
      location: "Aiguebelette (Savoie - 73)",
      description: "Volo panoramico sul lago verde di Aiguebelette lungo l'avant-pays savoyard.",
      takeoffs: [
        {
          name: "Col du Banchet",
          coordinates: "45.534200, 5.768100",
          altitude: 580,
          heading: 270,
          description: "Decollo erboso con pendenza costante.",
          reliability: 90
        }
      ],
      landings: [
        {
          name: "Marais d'Aiguebelette",
          coordinates: "45.541000, 5.789000",
          altitude: 370,
          description: "Atterraggio pianeggiante sulle rive meridionali del lago.",
          reliability: 90
        }
      ],
      reliability: 90
    }
  ],
  "Provence-Alpes-Côte d'Azur": [
    {
      location: "Roquebrune Cap-Martin (Côte d'Azur - 06)",
      description: "Celebre volo marittimo invernale con decollo sopra Monaco e atterraggio sulla spiaggia del Golfe Bleu.",
      takeoffs: [
        {
          name: "Mont Gros",
          coordinates: "43.766700, 7.433300",
          altitude: 680,
          heading: 170,
          description: "Decollo panoramico sulla baia di Monaco e Cap Martin.",
          reliability: 94
        }
      ],
      landings: [
        {
          name: "Plage du Golfe Bleu",
          coordinates: "43.755000, 7.446700",
          altitude: 5,
          description: "Atterraggio su spiaggia autorizzato nel periodo autunno-primavera.",
          reliability: 92
        }
      ],
      reliability: 94
    },
    {
      location: "Gourdon (Alpes-Maritimes - 06)",
      description: "Nido d'aquila sul retroterra di Grasse con termodinamica sulle gole del Loup.",
      takeoffs: [
        {
          name: "Gourdon Pré-Haut",
          coordinates: "43.725800, 6.974200",
          altitude: 810,
          heading: 180,
          description: "Decollo erboso con esposizione Sud.",
          reliability: 91
        }
      ],
      landings: [
        {
          name: "Pont du Loup",
          coordinates: "43.731700, 7.001700",
          altitude: 220,
          description: "Atterraggio alle porte della gola con manica a vento.",
          reliability: 90
        }
      ],
      reliability: 91
    },
    {
      location: "Saint-Vincent-les-Forts (Lac de Serre-Ponçon - 04)",
      description: "Sito termico d'eccezione affacciato sulle acque turchesi del lago di Serre-Ponçon.",
      takeoffs: [
        {
          name: "Saint-Vincent-les-Forts",
          coordinates: "44.446700, 6.368300",
          altitude: 1280,
          heading: 280,
          description: "Decollo sul ciglio del costone roccioso esposto a Ovest.",
          reliability: 93
        }
      ],
      landings: [
        {
          name: "Le Sauze du Lac",
          coordinates: "44.471700, 6.335000",
          altitude: 780,
          description: "Atterraggio ufficiale pianeggiante con ottima visibilità.",
          reliability: 92
        }
      ],
      reliability: 93
    },
    {
      location: "Courtet (Trièves / Vercors - 38)",
      description: "Decollo sotto le imponenti scogliere del massiccio del Dévoluy e del Vercors.",
      takeoffs: [
        {
          name: "Courtet",
          coordinates: "44.789200, 5.811700",
          altitude: 1500,
          heading: 200,
          description: "Decollo erboso regolare esposto a Sud/Sud-Ovest.",
          reliability: 91
        }
      ],
      landings: [
        {
          name: "Mens",
          coordinates: "44.815000, 5.760000",
          altitude: 750,
          description: "Atterraggio in pianura aperto e privo di ostacoli.",
          reliability: 91
        }
      ],
      reliability: 91
    }
  ]
};

export const CURATED_SWISS_SPOTS = {
  "Berner Oberland": [
    {
      location: "Interlaken - Beatenberg (BE)",
      description: "Sito capitale del volo tandem e cross svizzero con vista su Eiger, Mönch e Jungfrau e atterraggio a Höhematte.",
      takeoffs: [
        {
          name: "Amisbühl (Beatenberg)",
          coordinates: "46.701100, 7.788600",
          altitude: 1330,
          heading: 160,
          description: "Decollo erboso servito da autopostale con vista frontale sui laghi di Thun e Brienz.",
          reliability: 96
        }
      ],
      landings: [
        {
          name: "Höhematte (Interlaken)",
          coordinates: "46.686900, 7.859400",
          altitude: 565,
          description: "Grande prato comunale nel cuore di Interlaken riservato all'atterraggio dei parapendii.",
          reliability: 96
        }
      ],
      reliability: 96
    },
    {
      location: "Grindelwald - First & Pfingstegg (BE)",
      description: "Volo spettacoloso sotto la parete Nord dell'Eiger con decolli panoramici a First e Pfingstegg.",
      takeoffs: [
        {
          name: "Schreckfeld (First)",
          coordinates: "46.658043, 8.064975",
          altitude: 1955,
          heading: 200,
          description: "Decollo alto vicino alla stazione intermedia della cabinovia di First.",
          reliability: 94
        },
        {
          name: "Pfingstegg",
          coordinates: "46.616049, 8.056452",
          altitude: 1390,
          heading: 310,
          description: "Decollo servito dalla funivia di Pfingstegg con orientamento Nord-Ovest.",
          reliability: 90
        }
      ],
      landings: [
        {
          name: "Bodmi (Grindelwald)",
          coordinates: "46.628684, 8.043164",
          altitude: 1020,
          description: "Atterraggio ufficiale sopra Grindelwald ben collegato alla strada.",
          reliability: 93
        }
      ],
      reliability: 94
    },
    {
      location: "Lauterbrunnen - Mürren & Stechelberg (BE)",
      description: "La valle delle 72 cascate: decollo dalla terrazza di Mürren e planata a picco sulle gole di Stechelberg.",
      takeoffs: [
        {
          name: "Mürren (Schilthornbahn)",
          coordinates: "46.559200, 7.893100",
          altitude: 1640,
          heading: 80,
          description: "Decollo erboso accanto alla stazione della funivia di Mürren.",
          reliability: 92
        }
      ],
      landings: [
        {
          name: "Stechelberg",
          coordinates: "46.556391, 7.902635",
          altitude: 870,
          description: "Atterraggio ufficiale alla base della funivia per lo Schilthorn.",
          reliability: 92
        }
      ],
      reliability: 92
    },
    {
      location: "Niesen - Spiez (BE)",
      description: "La piramide del lago di Thun: dislivello di oltre 1700m con vista sui 4000 bernesi.",
      takeoffs: [
        {
          name: "Niesen Kulm",
          coordinates: "46.646400, 7.651700",
          altitude: 2340,
          heading: 10,
          description: "Decollo in quota sulla cresta sommitale raggiungibile con la storica funicolare.",
          reliability: 91
        }
      ],
      landings: [
        {
          name: "Wimmis (Spiez)",
          coordinates: "46.671900, 7.638100",
          altitude: 630,
          description: "Atterraggio in fondovalle con manica a vento adiacente all'uscita autostradale.",
          reliability: 91
        }
      ],
      reliability: 91
    },
    {
      location: "Brienz - Brienzer Rothorn (BE)",
      description: "Cresta delle Alpi dell'Emmental con vista a 360° sul lago turchese di Brienz.",
      takeoffs: [
        {
          name: "Brienzer Rothorn",
          coordinates: "46.788855, 8.036461",
          altitude: 2260,
          heading: 170,
          description: "Decollo sommitale raggiungibile con il treno a vapore a cremagliera.",
          reliability: 89
        }
      ],
      landings: [
        {
          name: "Hofstetten (Brienz)",
          coordinates: "46.755000, 8.052000",
          altitude: 570,
          description: "Atterraggio pianeggiante con manica a vento nei pressi del museo all'aperto di Ballenberg.",
          reliability: 89
        }
      ],
      reliability: 89
    },
    {
      location: "Schwarzsee - Hohmattli (FR/BE)",
      description: "Prealpi friburghesi con decollo sopra il lago nero di Schwarzsee.",
      takeoffs: [
        {
          name: "Hohmattli",
          coordinates: "46.669790, 7.318206",
          altitude: 1780,
          heading: 270,
          description: "Decollo erboso sulle creste prealpine.",
          reliability: 88
        }
      ],
      landings: [
        {
          name: "Schwarzsee Restaurant",
          coordinates: "46.668000, 7.285000",
          altitude: 1050,
          description: "Atterraggio adiacente alla riva orientale del lago.",
          reliability: 88
        }
      ],
      reliability: 88
    }
  ],
  "Valais": [
    {
      location: "Verbier - Ruinettes (VS)",
      description: "Comprensorio vallesano con forte attività termica e partenze per l'Aletsch e il Vallese centrale.",
      takeoffs: [
        {
          name: "Ruinettes",
          coordinates: "46.097500, 7.247200",
          altitude: 2200,
          heading: 220,
          description: "Decollo estivo e invernale con pendenza regolare servito da telecabina.",
          reliability: 94
        },
        {
          name: "Savoleyres",
          coordinates: "46.115800, 7.218900",
          altitude: 2350,
          heading: 170,
          description: "Decollo esposto a Sud con termiche precoci.",
          reliability: 91
        }
      ],
      landings: [
        {
          name: "Le Châble (Villette)",
          coordinates: "46.082800, 7.186700",
          altitude: 820,
          description: "Grande atterraggio ufficiale nel fondovalle della val di Bagnes.",
          reliability: 94
        }
      ],
      reliability: 94
    },
    {
      location: "Fiesch - Aletsch Arena (VS)",
      description: "L'autostrada delle Alpi: trampolino per i record mondiali di cross sopra il ghiacciaio dell'Aletsch.",
      takeoffs: [
        {
          name: "Fiescheralp Kühboden",
          coordinates: "46.406900, 8.118900",
          altitude: 2220,
          heading: 180,
          description: "Decollo leggendario per voli di oltre 200-300km lungo la dorsale vallesana.",
          reliability: 96
        }
      ],
      landings: [
        {
          name: "Fiesch Landeplatz",
          coordinates: "46.398600, 8.133600",
          altitude: 1060,
          description: "Atterraggio ufficiale con manica a vento a valle della stazione di partenza funivia.",
          reliability: 96
        }
      ],
      reliability: 96
    },
    {
      location: "Monthey - Chindonne (VS)",
      description: "Porta d'accesso alla val d'Illiez e Dents du Midi.",
      takeoffs: [
        {
          name: "Auberge de Chindonne",
          coordinates: "46.213729, 6.952761",
          altitude: 1690,
          heading: 330,
          description: "Decollo erboso con vista sulla valle del Rodano.",
          reliability: 89
        }
      ],
      landings: [
        {
          name: "Monthey Patinoire",
          coordinates: "46.262811, 6.959563",
          altitude: 420,
          description: "Atterraggio in pianura a Monthey.",
          reliability: 89
        }
      ],
      reliability: 89
    },
    {
      location: "Torgon - Portes du Soleil (VS)",
      description: "Comprensorio alpino dell'alta valle del Rodano affacciato sul lago Lemano.",
      takeoffs: [
        {
          name: "Torgon Virage",
          coordinates: "46.319514, 6.879857",
          altitude: 1480,
          heading: 290,
          description: "Decollo comodo con moquette.",
          reliability: 88
        }
      ],
      landings: [
        {
          name: "Vionnaz",
          coordinates: "46.316524, 6.900121",
          altitude: 395,
          description: "Atterraggio in valle con manica a vento.",
          reliability: 88
        }
      ],
      reliability: 88
    }
  ],
  "Graubünden": [
    {
      location: "Flims / Laax - Naraus & Crap Sogn Gion (GR)",
      description: "Altopiano retico sopra la gola del Reno (Ruinaulta) con termiche potenti.",
      takeoffs: [
        {
          name: "Crap Sogn Gion",
          coordinates: "46.837500, 9.215300",
          altitude: 2220,
          heading: 130,
          description: "Decollo in quota adiacente alla funivia di Laax.",
          reliability: 92
        },
        {
          name: "Naraus West",
          coordinates: "46.860811, 9.267589",
          altitude: 1840,
          heading: 190,
          description: "Decollo erboso sotto le pareti del Flimserstein.",
          reliability: 90
        }
      ],
      landings: [
        {
          name: "Larnags (Flims)",
          coordinates: "46.831900, 9.278900",
          altitude: 1160,
          description: "Atterraggio ufficiale su ampio prato alpino.",
          reliability: 91
        }
      ],
      reliability: 92
    },
    {
      location: "Klosters / Davos - Gotschnagrat (GR)",
      description: "Cresta alpina di collegamento tra la valle di Klosters e il bacino di Davos.",
      takeoffs: [
        {
          name: "Gotschnagrat Nord",
          coordinates: "46.858922, 9.843938",
          altitude: 2280,
          heading: 350,
          description: "Decollo sommitale con partenza diretta verso Klosters.",
          reliability: 91
        }
      ],
      landings: [
        {
          name: "Klosters Selfranga",
          coordinates: "46.865300, 9.882200",
          altitude: 1200,
          description: "Atterraggio ufficiale con manica a vento e parcheggio.",
          reliability: 91
        }
      ],
      reliability: 91
    },
    {
      location: "Lenzerheide - Scalottas (GR)",
      description: "Balcone d'alta quota della valle dell'Albula con decollo dal Piz Scalottas.",
      takeoffs: [
        {
          name: "Piz Scalottas",
          coordinates: "46.721031, 9.510204",
          altitude: 2320,
          heading: 110,
          description: "Decollo raggiungibile con seggiovia con dislivello di oltre 800m.",
          reliability: 90
        }
      ],
      landings: [
        {
          name: "Valbella",
          coordinates: "46.748000, 9.553000",
          altitude: 1500,
          description: "Atterraggio sul fondo valle vicino al lago Heidsee.",
          reliability: 90
        }
      ],
      reliability: 90
    }
  ],
  "Vaud": [
    {
      location: "Sonchaux - Montreux / Lac Léman (VD)",
      description: "Uno dei panorami più suggestivi della Svizzera: decollo da Sonchaux a picco sul castello di Chillon e lago Lemano.",
      takeoffs: [
        {
          name: "Sonchaux",
          coordinates: "46.425800, 6.945800",
          altitude: 1430,
          heading: 280,
          description: "Decollo magnifico esposto a Ovest verso il lago di Ginevra.",
          reliability: 94
        }
      ],
      landings: [
        {
          name: "Noville / Villeneuve",
          coordinates: "46.389605, 6.917414",
          altitude: 375,
          description: "Grande atterraggio alla foce del Rodano nel lago di Ginevra.",
          reliability: 94
        }
      ],
      reliability: 94
    }
  ],
  "Jura": [
    {
      location: "Tête-de-Ran - Neuchâtel (NE)",
      description: "Volo di cresta lungo l'arco del Giura svizzero con vista su tre laghi e le Alpi sullo sfondo.",
      takeoffs: [
        {
          name: "Tête-de-Ran",
          coordinates: "47.050600, 6.871100",
          altitude: 1380,
          heading: 160,
          description: "Decollo erboso esposto a Sud con termodinamica generosa.",
          reliability: 91
        }
      ],
      landings: [
        {
          name: "Les Hauts-Geneveys",
          coordinates: "47.042800, 6.892500",
          altitude: 980,
          description: "Atterraggio ufficiale sui pascoli del Giura.",
          reliability: 91
        }
      ],
      reliability: 91
    }
  ],
  "Ticino": [
    {
      location: "Monte Lema - Lugano (TI)",
      description: "La montagna del cross del Canton Ticino: decollo panoramico tra il lago Ceresio e il lago Maggiore.",
      takeoffs: [
        {
          name: "Monte Lema",
          coordinates: "46.023100, 8.831700",
          altitude: 1620,
          heading: 180,
          description: "Decollo raggiungibile con la funivia da Miglieglia, punto di partenza per voli verso il Sempione.",
          reliability: 93
        }
      ],
      landings: [
        {
          name: "Miglieglia",
          coordinates: "46.027800, 8.861700",
          altitude: 710,
          description: "Atterraggio alla base della funivia con club house e manica a vento.",
          reliability: 93
        }
      ],
      reliability: 93
    },
    {
      location: "Monte Tamaro (TI)",
      description: "Balcone panoramico sulle Alpi Lepontine e pianura padana.",
      takeoffs: [
        {
          name: "Alpe Foppa (Tamaro)",
          coordinates: "46.108000, 8.918000",
          altitude: 1530,
          heading: 190,
          description: "Decollo accanto alla cappella di Mario Botta servito da telecabina.",
          reliability: 91
        }
      ],
      landings: [
        {
          name: "Rivera Bironico",
          coordinates: "46.125000, 8.927000",
          altitude: 470,
          description: "Atterraggio ufficiale in fondovalle con manica a vento.",
          reliability: 91
        }
      ],
      reliability: 91
    }
  ],
  "Unterwalden": [
    {
      location: "Beckenried - Klewenalp (NW)",
      description: "Volo spettacolare sul lago dei Quattro Cantoni con decollo da Klewenalp.",
      takeoffs: [
        {
          name: "Klewenalp",
          coordinates: "46.948000, 8.473000",
          altitude: 1600,
          heading: 330,
          description: "Decollo servito dalla funivia più lunga della Svizzera centrale.",
          reliability: 90
        }
      ],
      landings: [
        {
          name: "Beckenried Dorni",
          coordinates: "46.968000, 8.475000",
          altitude: 440,
          description: "Atterraggio sulla riva del lago con manica a vento.",
          reliability: 90
        }
      ],
      reliability: 90
    }
  ]
};

export const CURATED_AUSTRIAN_SPOTS = {
  "Tirol": [
    {
      location: "Zillertal - Mayrhofen (Tirol)",
      description: "La mecca del parapendio tirolese con decollo dal Penken e discesa nel cuore della Zillertal.",
      takeoffs: [
        {
          name: "Penken (Mayrhofen)",
          coordinates: "47.168000, 11.815000",
          altitude: 2090,
          heading: 340,
          description: "Decollo ad alta quota con vista sulle Alpi Zillertaler.",
          reliability: 95
        }
      ],
      landings: [
        {
          name: "Mayrhofen Bruggerstube",
          coordinates: "47.182000, 11.871000",
          altitude: 630,
          description: "Atterraggio ufficiale con club house e ristorante per piloti.",
          reliability: 95
        }
      ],
      reliability: 95
    },
    {
      location: "Innsbruck - Nordkette (Tirol)",
      description: "Volo alpino direttamente sopra i tetti della capitale del Tirolo.",
      takeoffs: [
        {
          name: "Seegrube",
          coordinates: "47.306000, 11.380000",
          altitude: 1905,
          heading: 160,
          description: "Decollo esposto a Sud sulla valle dell'Inn servito dalla Nordkettenbahn.",
          reliability: 92
        }
      ],
      landings: [
        {
          name: "Hungerburg",
          coordinates: "47.287000, 11.398000",
          altitude: 860,
          description: "Atterraggio a mezza costa sopra Innsbruck.",
          reliability: 91
        }
      ],
      reliability: 92
    },
    {
      location: "Kössen - Unterberghorn (Tirol)",
      description: "Culla del volo libero austriaco con decollo riparato e termica costante.",
      takeoffs: [
        {
          name: "Bärenhütte",
          coordinates: "47.643000, 12.433000",
          altitude: 1500,
          heading: 300,
          description: "Decollo regolare con moquette adiacente al rifugio Bärenhütte.",
          reliability: 93
        }
      ],
      landings: [
        {
          name: "Kössen Fliegerbar",
          coordinates: "47.665000, 12.418000",
          altitude: 600,
          description: "Grande prato d'atterraggio presso la stazione a valle con la Fliegerbar.",
          reliability: 93
        }
      ],
      reliability: 93
    }
  ],
  "Kärnten": [
    {
      location: "Greifenburg - Emberger Alm (Kärnten)",
      description: "Sito mondiale di volo nella Drautal: termiche potenti e punto di partenza per triangoli FAI epici.",
      takeoffs: [
        {
          name: "Emberger Alm",
          coordinates: "46.772000, 13.155000",
          altitude: 1750,
          heading: 180,
          description: "Decollo eccezionale esposto a Sud con termiche precoci fin dal mattino.",
          reliability: 96
        }
      ],
      landings: [
        {
          name: "Greifenburg Fliegercamp",
          coordinates: "46.745000, 13.180000",
          altitude: 610,
          description: "Il più famoso campeggio per piloti d'Europa con laghetto e grande atterraggio.",
          reliability: 96
        }
      ],
      reliability: 96
    }
  ],
  "Salzburg": [
    {
      location: "Zell am See - Schmittenhöhe (Salzburg)",
      description: "Volo spettacolare sul lago di Zell con vista sui ghiacciai degli Alti Tauri.",
      takeoffs: [
        {
          name: "Schmittenhöhe",
          coordinates: "47.329000, 12.738000",
          altitude: 1965,
          heading: 90,
          description: "Decollo sommitale servito da funivia, ottimo punto di partenza per cross.",
          reliability: 93
        }
      ],
      landings: [
        {
          name: "Fürth Piesendorf",
          coordinates: "47.291000, 12.753000",
          altitude: 760,
          description: "Ampio campo d'atterraggio ufficiale nella valle della Salzach.",
          reliability: 92
        }
      ],
      reliability: 93
    }
  ],
  "Steiermark": [
    {
      location: "Schladming - Planai (Steiermark)",
      description: "Sito della valle dell'Enns di fronte all'imponente parete Sud del Dachstein.",
      takeoffs: [
        {
          name: "Planai Schafalm",
          coordinates: "47.375000, 13.725000",
          altitude: 1820,
          heading: 330,
          description: "Decollo erboso servito dalla cabinovia della Planai.",
          reliability: 91
        }
      ],
      landings: [
        {
          name: "Schladming WM-Stadion",
          coordinates: "47.394000, 13.693000",
          altitude: 740,
          description: "Atterraggio ufficiale nella piana di Schladming.",
          reliability: 91
        }
      ],
      reliability: 91
    }
  ]
};

export const CURATED_GERMAN_SPOTS = {
  "Bayern": [
    {
      location: "Tegelberg - Füssen (Allgäu - BY)",
      description: "Volo da favola sui castelli di Neuschwanstein e Hohenschwangau.",
      takeoffs: [
        {
          name: "Tegelberg Bergstation",
          coordinates: "47.558000, 10.778000",
          altitude: 1720,
          heading: 320,
          description: "Decollo su moquette con decollo con vento da Ovest/Nord-Ovest.",
          reliability: 94
        }
      ],
      landings: [
        {
          name: "Tegelberg Talstation",
          coordinates: "47.570000, 10.758000",
          altitude: 830,
          description: "Atterraggio ufficiale con manica a vento adiacente al parcheggio funivia.",
          reliability: 94
        }
      ],
      reliability: 94
    },
    {
      location: "Brauneck - Lenggries (Isarwinkel - BY)",
      description: "La montagna di volo di Monaco di Baviera sulle prealpi bavaresi.",
      takeoffs: [
        {
          name: "Brauneck Gipfel",
          coordinates: "47.661000, 11.523000",
          altitude: 1555,
          heading: 180,
          description: "Decollo sommitale con decolli esposti a Sud e a Nord.",
          reliability: 92
        }
      ],
      landings: [
        {
          name: "Lenggries Streidlhang",
          coordinates: "47.674000, 11.558000",
          altitude: 700,
          description: "Atterraggio ufficiale adiacente alla stazione di valle della Brauneckbahn.",
          reliability: 92
        }
      ],
      reliability: 92
    },
    {
      location: "Nebelhorn - Oberstdorf (Allgäu - BY)",
      description: "Volo d'alta montagna nelle Alpi dell'Algovia con decollo oltre i 1900m.",
      takeoffs: [
        {
          name: "Nebelhorn Höfatsblick",
          coordinates: "47.418000, 10.339000",
          altitude: 1930,
          heading: 250,
          description: "Decollo alto vicino alla stazione intermedia della Nebelhornbahn.",
          reliability: 93
        }
      ],
      landings: [
        {
          name: "Oberstdorf Oybele",
          coordinates: "47.408000, 10.292000",
          altitude: 820,
          description: "Atterraggio ufficiale a monte dell'abitato di Oberstdorf.",
          reliability: 92
        }
      ],
      reliability: 93
    }
  ]
};

export function enrichLocationsCatalog() {
  const rawCatalog = JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf-8'));

  // 1. Enrich France
  if (!rawCatalog.FR) {
    rawCatalog.FR = {};
  }
  for (const [regionName, spots] of Object.entries(CURATED_FRENCH_SPOTS)) {
    if (!rawCatalog.FR[regionName]) {
      rawCatalog.FR[regionName] = [];
    }
    for (const spot of spots) {
      if (!rawCatalog.FR[regionName].some(s => s.location === spot.location)) {
        rawCatalog.FR[regionName].push(spot);
      }
    }
  }

  // 2. Add Switzerland
  if (!rawCatalog.CH) {
    rawCatalog.CH = {};
  }
  for (const [regionName, spots] of Object.entries(CURATED_SWISS_SPOTS)) {
    if (!rawCatalog.CH[regionName]) {
      rawCatalog.CH[regionName] = [];
    }
    for (const spot of spots) {
      if (!rawCatalog.CH[regionName].some(s => s.location === spot.location)) {
        rawCatalog.CH[regionName].push(spot);
      }
    }
  }

  // 3. Add Austria
  if (!rawCatalog.AT) {
    rawCatalog.AT = {};
  }
  for (const [regionName, spots] of Object.entries(CURATED_AUSTRIAN_SPOTS)) {
    if (!rawCatalog.AT[regionName]) {
      rawCatalog.AT[regionName] = [];
    }
    for (const spot of spots) {
      if (!rawCatalog.AT[regionName].some(s => s.location === spot.location)) {
        rawCatalog.AT[regionName].push(spot);
      }
    }
  }

  // 4. Add Germany
  if (!rawCatalog.DE) {
    rawCatalog.DE = {};
  }
  for (const [regionName, spots] of Object.entries(CURATED_GERMAN_SPOTS)) {
    if (!rawCatalog.DE[regionName]) {
      rawCatalog.DE[regionName] = [];
    }
    for (const spot of spots) {
      if (!rawCatalog.DE[regionName].some(s => s.location === spot.location)) {
        rawCatalog.DE[regionName].push(spot);
      }
    }
  }

  fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(rawCatalog, null, 2), 'utf-8');
  console.log(`[Enrichment] Updated ${LOCATIONS_FILE} with continental FR, CH, AT, DE spots.`);

  // Run sharding
  runSharding({ sourceFile: LOCATIONS_FILE });
  console.log('[Enrichment] Sharding complete.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  enrichLocationsCatalog();
}

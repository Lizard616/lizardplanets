/**
 * Site-wide config and wiki sidebar navigation branches.
 *
 * Each branch is an ordered array. Entries can be:
 * - string — article basename (e.g. "Neclite.md" or "Neclite"); menu label defaults to the
 *   file name including the `.md` extension.
 * - { file: "Name.md", label?: "Override", path?: "dir/Name.md" } — optional `path` disambiguates
 *   when two articles share the same basename (relative to `content/`).
 * - { label: "Section", children: [...] } — grouping row; link resolved like the old wiki nav.
 * - { label: "…", href: "https://…" } — explicit URL.
 *
 * Keys must match TOP_LEVEL_NAV `key` values in wiki.js (e.g. "celestial-objects").
 */
module.exports = {
  title: "Lizard-Planets Wiki",
  description: "about fictional worlds and their languages",
  language: "en",
  // Absolute base URL (no trailing slash). Used for og:url and og:image.
  // Update this once the domain/GitHub Pages URL is known.
  url: "",
  legal: {
    textLicense: "Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International (CC BY-NC-ND 4.0)",
    imageLicense: "All Rights Reserved"
  },
  template_field_groups: {
    alieninfo: [
      {
        label: "Identity",
        keys: ["homeworld", "habitat", "taxonomy", "distinctions"]
      },
      {
        label: "Biology",
        keys: [
          "average_height",
          "weight",
          "skin_color",
          "blood_color",
          "thermoregulation",
          "birth_method",
          "reproduction",
          "gestation_period_length",
          "lifespan",
          "locomotion"
        ]
      },
      {
        label: "Relations",
        keys: ["allies", "enemies"]
      }
    ],
    character: [
      {
        label: "Profile",
        keys: ["species", "homeworld", "occupation", "affiliation"]
      },
      {
        label: "Traits",
        keys: ["age", "gender", "height", "weight", "status"]
      },
      {
        label: "Relations",
        keys: ["family", "friends", "allies", "enemies"]
      }
    ],
    droneinfo: [
      {
        label: "Profile",
        keys: ["model", "manufacturer", "affiliation", "status"]
      },
      {
        label: "Capabilities",
        keys: ["weapons", "abilities", "power_source", "speed"]
      },
      {
        label: "History",
        keys: ["first_appearance", "created", "notes"]
      }
    ],
    government: [
      {
        label: "State",
        keys: ["title", "organization_type", "capital", "official_language", "currency"]
      },
      {
        label: "Leadership",
        keys: ["head_of_state", "head_of_government", "commander_in_chief"]
      },
      {
        label: "Institutions",
        keys: ["executive_branch", "legislative_branch", "military_branch", "constitution"]
      }
    ],
    item: [
      {
        label: "Overview",
        keys: ["title", "type", "usage", "origin"]
      },
      {
        label: "Specifications",
        keys: ["mass", "size", "composition", "power_source"]
      },
      {
        label: "Status",
        keys: ["owner", "location", "status"]
      }
    ],
    moon: [
      {
        label: "Orbital",
        keys: ["parent_body", "orbital_period", "semimajor_axis", "solar_day"]
      },
      {
        label: "Physical",
        keys: ["class", "diameter", "mass", "gravity", "temperature"]
      },
      {
        label: "Environment",
        keys: ["atmospheric_composition", "pressure", "sea_composition", "suns"]
      }
    ],
    satelliteinfo: [
      {
        label: "Orbital",
        keys: ["parent_body", "orbital_period", "semimajor_axis", "solar_day"]
      },
      {
        label: "Physical",
        keys: ["class", "diameter", "mass", "gravity", "temperature"]
      },
      {
        label: "Environment",
        keys: ["atmospheric_composition", "pressure", "sea_composition", "suns"]
      }
    ],
    shipinfo: [
      {
        label: "Class",
        keys: ["type", "class", "manufacturer", "affiliation"]
      },
      {
        label: "Specifications",
        keys: ["length", "mass", "power_source", "speed"]
      },
      {
        label: "Systems",
        keys: ["weapons", "defenses", "crew", "capacity"]
      }
    ],
    starinfo: [
      {
        label: "Classification",
        keys: ["type", "class", "age", "temperature"]
      },
      {
        label: "Physical",
        keys: ["mass", "radius", "luminosity", "diameter"]
      },
      {
        label: "System",
        keys: ["system", "planets", "distance", "notable_features"]
      }
    ],
    galacticinfo: [
      {
        label: "Structure",
        keys: ["type", "diameter", "arms", "number_of_stars", "planets"]
      },
      {
        label: "Dynamics",
        keys: ["central_black_hole", "dark_matter", "satellite_galaxies"]
      },
      {
        label: "Civilization",
        keys: ["population", "notable_civilizations", "notable_events"]
      }
    ],
    blackhole: [
      {
        label: "Core",
        keys: ["title", "solar_masses", "diameter", "schwarzschild_radius"]
      },
      {
        label: "Field",
        keys: ["gravity", "intensity", "polarity", "temperature"]
      },
      {
        label: "Usage",
        keys: ["usage", "energy_harnessing", "galactic_evolution"]
      }
    ],
    planetaryoverview: [
      {
        label: "Astrographical Info",
        keys: ["class", "diameter", "mass", "gravity", "axial_tilt", "age", "suns"]
      },
      {
        label: "Orbital",
        keys: ["system", "galaxy", "orbital_period", "semimajor_axis", "rotation_period", "solar_day"]
      },
      {
        label: "Atmosphere",
        keys: [
          "atmospheric_color",
          "atmospheric_composition",
          "atmospheric_toxicity",
          "atmospheric_pressure",
          "greenhouse_eff",
          "temperature"
        ]
      },
      {
        label: "Surface",
        keys: ["terrain", "water_state", "sea_composition", "major_moons", "moons"]
      }
    ]
  },
  menu: {
    "Celestial Objects": {
      "Moons": {
      },
      "Planets": {
        "Super-Earths": {
        },
        "Gas Giants": {
        },
        "Subearths": {
        },
        "Destroyed": {
        },
        "Partially Destroyed": {
        }
      },
      "Black Holes": {
      },
      "Stars": {
        "Main Sequence": {
        },
        "Pulsars": {
        },
        "Red Giants": {
        }
      },
      "Dwarf Planets": {
      },
      "Galaxies": {
        "Spiral": {
        },
        "Elliptical": {
        }
      },
      "Star Systems": {
      }
    },
    "Characters": {
      "Individuals": {
        "Protagonists": {
        },
        "Deuteragonists": {
        },
        "Tritagonists": {
        },
        "Tetragonists": {
        },
        "Main Antagonists": {
        },
        "Lesser Antagonists": {
        }
      },
      "Species": {
        "Main Races": {
        },
        "Lesser Races": {
        }
      }
    },
    "The Story": {
    },
    "Policies": {
    }
  }
};

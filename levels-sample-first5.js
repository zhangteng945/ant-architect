/*
 * 《蚂蚁小画家》feedback-2221 前 5 关本地样板数据（A/B/C/D 齐备版）（原创像素画，2026-11-19）
 * 仅用于 ?sample=first5 本地试玩；不替换旧 200 关，不自动发布。
 * 每关 width / height 都是真实网格；颜色字符沿用 levels.js 的 MATERIALS。
 * 本文件由 tools/build-first5-levels.js 生成，不要手改地图。
 */
(function (root) {
  const SAMPLE_LEVELS = [
  {
    "id": "first-food-01-sun-egg",
    "no": 1,
    "name": "太阳蛋小碟",
    "theme": "first-foods",
    "themeIndex": 0,
    "themeName": "首组美食",
    "tag": "入门",
    "difficulty": 1,
    "difficultyTier": 1,
    "pixelUnit": 1,
    "colorCount": 7,
    "mechanic": "单色开场 · 远格先画",
    "teaches": "从离巢最远的同色格开始，先把盘沿画出来，再收蛋黄。",
    "hint": "先点颜色数最少的令牌，让外圈先亮起来。",
    "sample": true,
    "width": 22,
    "height": 18,
    "map": [
      "WCWWWWWWCWWWWWWCWWWWWW",
      "WCWWWWWWCWWWWWWCWWWWWW",
      "WCMMWWWWCWWWWWWCWWWWWW",
      "WCMWWWWWCWWWWWWCWWWWWW",
      "WCWWWWWBSSBBBBBCWWWWWW",
      "WCWWBBBSSSSNSSSBBBWWWW",
      "WCWBBNSSSSSSSSSNNBBWWW",
      "WCBNNNSSSHHHHSSSNNNBWW",
      "WBBNNNSSHHHHHHSSSNNBBW",
      "WBBNNSSSHHHHHHSSSNNBBW",
      "WBBNNNSSSHHHHHSSNNNBBW",
      "WCBNNNNSSSSSSSSNNNNBWW",
      "WCWBBNNSSSSSSSSNNBBWWW",
      "WCWWBBBNSNNNNNNBBBWWWW",
      "WCWWWWWBBBBBBBBCWWWWWW",
      "WCWWWWWWCWWWWWWCWWMMWW",
      "WCWWWWWWCWWWWWWCWWWWWW",
      "WCWWWWWWCWWWWWWCWWWWWW"
    ],
    "colorCounts": {
      "W": 188,
      "C": 31,
      "M": 5,
      "B": 50,
      "S": 57,
      "N": 44,
      "H": 21
    },
    "presetQueue": {
      "schema": "ant-architect-preset-queue-v1",
      "version": 1,
      "source": "levels-sample-first5.js:presetQueue",
      "levelNo": 1,
      "difficultyTier": 1,
      "difficultyMethod": "难度 1 级 → 目标 10 步；buildLaunchQueueLevel 生成 + 制作期颜色打散 + verifyQueuePlaythrough(18)",
      "target": 10,
      "seed": 8,
      "mode": "far-to-near-balanced1",
      "groups": [
        {
          "id": "q1",
          "color": "M",
          "n": 5
        },
        {
          "id": "q2",
          "color": "W",
          "n": 38
        },
        {
          "id": "q3",
          "color": "S",
          "n": 57
        },
        {
          "id": "q4",
          "color": "N",
          "n": 44
        },
        {
          "id": "q5",
          "color": "W",
          "n": 47
        },
        {
          "id": "q6",
          "color": "H",
          "n": 21
        },
        {
          "id": "q7",
          "color": "W",
          "n": 51
        },
        {
          "id": "q8",
          "color": "W",
          "n": 52
        },
        {
          "id": "q9",
          "color": "C",
          "n": 31
        },
        {
          "id": "q10",
          "color": "B",
          "n": 50
        }
      ],
      "columns": [
        [
          "q1",
          "q2"
        ],
        [
          "q3",
          "q4",
          "q5"
        ],
        [
          "q6",
          "q7"
        ],
        [
          "q8",
          "q9",
          "q10"
        ]
      ],
      "verified": true,
      "check": {
        "ok": true,
        "reason": "ok",
        "filled": 396,
        "total": 396,
        "maxInFlight": 18
      },
      "scatter": {
        "applied": true,
        "variant": "balanced-smooth",
        "attempt": 1,
        "seed": 2779096493,
        "metrics": {
          "distinctPerColumnAvg": 2.5,
          "visibleDistinctPerColumnAvg": 2.5,
          "sameColorColumns": 0,
          "maxSameColorRun": 1
        },
        "attempts": [
          {
            "variant": "balanced-smooth",
            "ok": true,
            "reason": "ok",
            "metrics": {
              "distinctPerColumnAvg": 2.5,
              "visibleDistinctPerColumnAvg": 2.5,
              "sameColorColumns": 0,
              "maxSameColorRun": 1
            }
          }
        ]
      },
      "generation": {
        "source": "launch-sequence",
        "attempt": 1,
        "orderMode": "far-to-near",
        "solver": "min",
        "safety": false,
        "fallback": false,
        "colorScatter": {
          "applied": true,
          "variant": "balanced-smooth",
          "attempt": 1,
          "seed": 2779096493,
          "metrics": {
            "distinctPerColumnAvg": 2.5,
            "visibleDistinctPerColumnAvg": 2.5,
            "sameColorColumns": 0,
            "maxSameColorRun": 1
          },
          "attempts": [
            {
              "variant": "balanced-smooth",
              "ok": true,
              "reason": "ok",
              "metrics": {
                "distinctPerColumnAvg": 2.5,
                "visibleDistinctPerColumnAvg": 2.5,
                "sameColorColumns": 0,
                "maxSameColorRun": 1
              }
            }
          ]
        },
        "preset": {
          "schema": "ant-architect-preset-queue-v1",
          "builder": "tools/build-first5-levels.js",
          "generatedForLevel": 1,
          "difficultyTier": 1,
          "target": 10,
          "method": "难度 1 级 → 目标 10 步；buildLaunchQueueLevel 生成 + 制作期颜色打散 + verifyQueuePlaythrough(18)",
          "seed": 8,
          "verifiedAtBuild": true
        }
      }
    }
  },
  {
    "id": "first-food-02-watermelon",
    "no": 2,
    "name": "西瓜角",
    "theme": "first-foods",
    "themeIndex": 0,
    "themeName": "首组美食",
    "tag": "入门",
    "difficulty": 1,
    "difficultyTier": 1,
    "pixelUnit": 1,
    "colorCount": 5,
    "mechanic": "双色并行 · 瓜皮留边",
    "teaches": "红瓤和绿皮可以同时开工；先画远角，尖角处留到最后。",
    "hint": "瓜皮是窄边，别把它留成最后一段无路可走。",
    "sample": true,
    "width": 20,
    "height": 24,
    "map": [
      "HHHHHHHHHHHHHHHHHHHH",
      "HHHHHHHHHHHHHHHHHHHH",
      "WWWWWWWWWWWWWWWWWWWW",
      "HHHHHHHHHHHHHHHHHHHH",
      "HHHHHHHHHHHHHHHHHHHH",
      "HHMMCCCCCCCCCCCCCMMH",
      "HHMDCCCCCCCCCCCCCDMH",
      "HHHMDCCCCCCCCCCCDMHH",
      "WWWMDCCCCCCCCCCCDMWW",
      "HHHHMDCDCCCCDCCDMHHH",
      "HHHHMDCDCCCCDCCDMHHH",
      "HHHHHMDCCCCCCCDMHHHH",
      "HHHHHMDCCDCCCCDMHHHH",
      "HHHHHHMDCDCCCDMHHHHH",
      "WWWWWWDDCCCCCDMWWWWW",
      "HHHHHHDMDCCCDDHHHHHH",
      "HHHHHHHMDCCCDMHHHHHH",
      "HHHHHHHHDDCDMHHHHHHH",
      "HHHHHHHHMDCDMHHHHHHH",
      "HHHHHHHHHMDMHHHHHHHH",
      "WWWWWWWWWMDMWWWWWWWW",
      "HHHHHHHHHHMHHHHHHHHH",
      "HHHHHHHHHHHHHHHHHHHH",
      "HHHHHHHHHHHHHHHHHHHH"
    ],
    "colorCounts": {
      "H": 265,
      "W": 53,
      "M": 32,
      "C": 92,
      "D": 38
    },
    "presetQueue": {
      "schema": "ant-architect-preset-queue-v1",
      "version": 1,
      "source": "levels-sample-first5.js:presetQueue",
      "levelNo": 2,
      "difficultyTier": 1,
      "difficultyMethod": "难度 1 级 → 目标 10 步；buildLaunchQueueLevel 生成 + 制作期颜色打散 + verifyQueuePlaythrough(18)",
      "target": 10,
      "seed": 2723777243,
      "mode": "far-to-near-balanced1",
      "groups": [
        {
          "id": "q1",
          "color": "M",
          "n": 32
        },
        {
          "id": "q2",
          "color": "C",
          "n": 45
        },
        {
          "id": "q3",
          "color": "H",
          "n": 55
        },
        {
          "id": "q4",
          "color": "C",
          "n": 47
        },
        {
          "id": "q5",
          "color": "H",
          "n": 42
        },
        {
          "id": "q6",
          "color": "D",
          "n": 38
        },
        {
          "id": "q7",
          "color": "H",
          "n": 57
        },
        {
          "id": "q8",
          "color": "H",
          "n": 54
        },
        {
          "id": "q9",
          "color": "W",
          "n": 53
        },
        {
          "id": "q10",
          "color": "H",
          "n": 57
        }
      ],
      "columns": [
        [
          "q1",
          "q2",
          "q3"
        ],
        [
          "q4",
          "q5"
        ],
        [
          "q6",
          "q7"
        ],
        [
          "q8",
          "q9",
          "q10"
        ]
      ],
      "verified": true,
      "check": {
        "ok": true,
        "reason": "ok",
        "filled": 480,
        "total": 480,
        "maxInFlight": 18
      },
      "scatter": {
        "applied": true,
        "variant": "balanced-smooth",
        "attempt": 1,
        "seed": 133967742,
        "metrics": {
          "distinctPerColumnAvg": 2.25,
          "visibleDistinctPerColumnAvg": 2.25,
          "sameColorColumns": 0,
          "maxSameColorRun": 1
        },
        "attempts": [
          {
            "variant": "balanced-smooth",
            "ok": true,
            "reason": "ok",
            "metrics": {
              "distinctPerColumnAvg": 2.25,
              "visibleDistinctPerColumnAvg": 2.25,
              "sameColorColumns": 0,
              "maxSameColorRun": 1
            }
          }
        ]
      },
      "generation": {
        "source": "launch-sequence",
        "attempt": 1,
        "orderMode": "far-to-near",
        "solver": "min",
        "safety": false,
        "fallback": false,
        "colorScatter": {
          "applied": true,
          "variant": "balanced-smooth",
          "attempt": 1,
          "seed": 133967742,
          "metrics": {
            "distinctPerColumnAvg": 2.25,
            "visibleDistinctPerColumnAvg": 2.25,
            "sameColorColumns": 0,
            "maxSameColorRun": 1
          },
          "attempts": [
            {
              "variant": "balanced-smooth",
              "ok": true,
              "reason": "ok",
              "metrics": {
                "distinctPerColumnAvg": 2.25,
                "visibleDistinctPerColumnAvg": 2.25,
                "sameColorColumns": 0,
                "maxSameColorRun": 1
              }
            }
          ]
        },
        "preset": {
          "schema": "ant-architect-preset-queue-v1",
          "builder": "tools/build-first5-levels.js",
          "generatedForLevel": 2,
          "difficultyTier": 1,
          "target": 10,
          "method": "难度 1 级 → 目标 10 步；buildLaunchQueueLevel 生成 + 制作期颜色打散 + verifyQueuePlaythrough(18)",
          "seed": 2723777243,
          "verifiedAtBuild": true
        }
      }
    }
  },
  {
    "id": "first-food-03-donut",
    "no": 3,
    "name": "糖霜甜甜圈",
    "theme": "first-foods",
    "themeIndex": 0,
    "themeName": "首组美食",
    "tag": "入门",
    "difficulty": 2,
    "difficultyTier": 2,
    "pixelUnit": 1,
    "colorCount": 6,
    "mechanic": "圆环 · 中心留孔",
    "teaches": "甜甜圈中心是背景孔，不是待填格；沿圆环从外到内收。",
    "hint": "先画最外圈，再收糖霜和彩针。",
    "sample": true,
    "width": 24,
    "height": 24,
    "map": [
      "BBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBNBBBBBBNBBBBBBNBBBBBB",
      "BBBBBBBBBBCCBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBWCCPPHHWBBBBBBBB",
      "BBBBBBWHHPPPPPPPPWBBBBBB",
      "BBBBBWPPPPPPPPPPCCWNBBBB",
      "BBBBWPPPPPPPPPPPPPPWBBBB",
      "BBBBWPHHPPPPPPPPPHHWBBBB",
      "BBBBPPPPPPBBBBPPPPPPBBBB",
      "BBBWPWPPPBBBBBBCCPPPWBBB",
      "BBBWWWWPPBBBBBBWWWPPWBBB",
      "BBBBWWWWCCBBBBHHWWWPBBBB",
      "BBBBWWWWWWWBBWWWWWWWBBBB",
      "BBBBWWWWWWWWWWWWWWWWBBBB",
      "BBBBBWWWWWWWWWWWWWWBBBBB",
      "BBBBBNWWWWWWWWWWWWBNBBBB",
      "BBBBBBBWWWWWWWWWWBBBBBBB",
      "BBBBBBBBBBWWWWBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBNBBBBBBNBBBBBBNBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBB"
    ],
    "colorCounts": {
      "B": 381,
      "N": 9,
      "C": 10,
      "W": 98,
      "P": 68,
      "H": 10
    },
    "presetQueue": {
      "schema": "ant-architect-preset-queue-v1",
      "version": 1,
      "source": "levels-sample-first5.js:presetQueue",
      "levelNo": 3,
      "difficultyTier": 2,
      "difficultyMethod": "难度 2 级 → 目标 30 步；buildLaunchQueueLevel 生成 + 制作期颜色打散 + verifyQueuePlaythrough(18)",
      "target": 30,
      "seed": 1150358698,
      "mode": "far-to-near-balanced1",
      "groups": [
        {
          "id": "q1",
          "color": "N",
          "n": 9
        },
        {
          "id": "q2",
          "color": "B",
          "n": 26
        },
        {
          "id": "q3",
          "color": "B",
          "n": 17
        },
        {
          "id": "q4",
          "color": "B",
          "n": 17
        },
        {
          "id": "q5",
          "color": "W",
          "n": 18
        },
        {
          "id": "q6",
          "color": "B",
          "n": 28
        },
        {
          "id": "q7",
          "color": "B",
          "n": 17
        },
        {
          "id": "q8",
          "color": "P",
          "n": 23
        },
        {
          "id": "q9",
          "color": "C",
          "n": 10
        },
        {
          "id": "q10",
          "color": "B",
          "n": 22
        },
        {
          "id": "q11",
          "color": "B",
          "n": 17
        },
        {
          "id": "q12",
          "color": "P",
          "n": 13
        },
        {
          "id": "q13",
          "color": "B",
          "n": 22
        },
        {
          "id": "q14",
          "color": "B",
          "n": 20
        },
        {
          "id": "q15",
          "color": "W",
          "n": 17
        },
        {
          "id": "q16",
          "color": "B",
          "n": 20
        },
        {
          "id": "q17",
          "color": "P",
          "n": 15
        },
        {
          "id": "q18",
          "color": "W",
          "n": 21
        },
        {
          "id": "q19",
          "color": "B",
          "n": 19
        },
        {
          "id": "q20",
          "color": "B",
          "n": 27
        },
        {
          "id": "q21",
          "color": "H",
          "n": 10
        },
        {
          "id": "q22",
          "color": "B",
          "n": 18
        },
        {
          "id": "q23",
          "color": "B",
          "n": 28
        },
        {
          "id": "q24",
          "color": "W",
          "n": 19
        },
        {
          "id": "q25",
          "color": "B",
          "n": 22
        },
        {
          "id": "q26",
          "color": "W",
          "n": 23
        },
        {
          "id": "q27",
          "color": "B",
          "n": 21
        },
        {
          "id": "q28",
          "color": "P",
          "n": 17
        },
        {
          "id": "q29",
          "color": "B",
          "n": 22
        },
        {
          "id": "q30",
          "color": "B",
          "n": 18
        }
      ],
      "columns": [
        [
          "q1",
          "q2",
          "q3",
          "q4",
          "q5",
          "q6",
          "q7",
          "q8"
        ],
        [
          "q9",
          "q10",
          "q11",
          "q12",
          "q13",
          "q14",
          "q15",
          "q16"
        ],
        [
          "q17",
          "q18",
          "q19",
          "q20",
          "q21",
          "q22",
          "q23",
          "q24"
        ],
        [
          "q25",
          "q26",
          "q27",
          "q28",
          "q29",
          "q30"
        ]
      ],
      "verified": true,
      "check": {
        "ok": true,
        "reason": "ok",
        "filled": 576,
        "total": 576,
        "maxInFlight": 18
      },
      "scatter": {
        "applied": true,
        "variant": "balanced-shuffle-1",
        "attempt": 6,
        "seed": 3778326799,
        "metrics": {
          "distinctPerColumnAvg": 3.75,
          "visibleDistinctPerColumnAvg": 2.25,
          "sameColorColumns": 0,
          "maxSameColorRun": 3
        },
        "attempts": [
          {
            "variant": "balanced-shuffle-1",
            "ok": true,
            "reason": "ok",
            "metrics": {
              "distinctPerColumnAvg": 3.75,
              "visibleDistinctPerColumnAvg": 2.25,
              "sameColorColumns": 0,
              "maxSameColorRun": 3
            }
          }
        ]
      },
      "generation": {
        "source": "launch-sequence",
        "attempt": 1,
        "orderMode": "far-to-near",
        "solver": "min",
        "safety": false,
        "fallback": false,
        "colorScatter": {
          "applied": true,
          "variant": "balanced-shuffle-1",
          "attempt": 6,
          "seed": 3778326799,
          "metrics": {
            "distinctPerColumnAvg": 3.75,
            "visibleDistinctPerColumnAvg": 2.25,
            "sameColorColumns": 0,
            "maxSameColorRun": 3
          },
          "attempts": [
            {
              "variant": "balanced-shuffle-1",
              "ok": true,
              "reason": "ok",
              "metrics": {
                "distinctPerColumnAvg": 3.75,
                "visibleDistinctPerColumnAvg": 2.25,
                "sameColorColumns": 0,
                "maxSameColorRun": 3
              }
            }
          ]
        },
        "preset": {
          "schema": "ant-architect-preset-queue-v1",
          "builder": "tools/build-first5-levels.js",
          "generatedForLevel": 3,
          "difficultyTier": 2,
          "target": 30,
          "method": "难度 2 级 → 目标 30 步；buildLaunchQueueLevel 生成 + 制作期颜色打散 + verifyQueuePlaythrough(18)",
          "seed": 1150358698,
          "verifiedAtBuild": true
        }
      }
    }
  },
  {
    "id": "first-food-04-strawberry",
    "no": 4,
    "name": "草莓",
    "theme": "first-foods",
    "themeIndex": 0,
    "themeName": "首组美食",
    "tag": "入门",
    "difficulty": 2,
    "difficultyTier": 2,
    "pixelUnit": 1,
    "colorCount": 7,
    "mechanic": "尖角收尾 · 高光同色",
    "teaches": "草莓下尖的格少，留到后面；高光和果肉同色，按格数分配。",
    "hint": "先画左右两侧的长边，尖角最后自然收拢。",
    "sample": true,
    "width": 18,
    "height": 24,
    "map": [
      "NBBBBBBBBNBBBBBBBB",
      "BBBBBBBBNBBBBBBBBN",
      "BBBBBBBNBDBBBBBBNB",
      "BBBBBBNMMDBBBBBNBB",
      "BBBBBMMMMDMMBBNBBB",
      "BBBBMMMMMMMMMNBBBB",
      "BBBNMMMMCMMMMBBBBB",
      "BBNBCMMCCCMMCCBBBB",
      "BNBCCPPCCCCCCCCBBB",
      "NBBCCPPCCCCHCCCBBB",
      "BBBCCPPHCCCCCCCBBN",
      "BBBCCPPCCCCCCCCBNB",
      "BBBCCPPCCHCCCCCNBB",
      "BBBCCPPCCCCCCHCBBB",
      "BBBBCCHCCCCCCCBBBB",
      "BBBNCCPCCCCCCCBBBB",
      "BBNBBCCPCCHCCBBBBB",
      "BNBBBBCCPCCCBBBBBB",
      "NBBBBBBCHCCBBBBBBB",
      "BBBBBBBBNBBBBBBBBN",
      "BBBBBBBNBBBBBBBBNB",
      "BBBBBBNBBBBBBBBNBB",
      "BBBBBNBBBBBBBBNBBB",
      "BBBBNBBBBBBBBNBBBB"
    ],
    "colorCounts": {
      "N": 31,
      "B": 252,
      "D": 3,
      "M": 29,
      "C": 95,
      "P": 15,
      "H": 7
    },
    "presetQueue": {
      "schema": "ant-architect-preset-queue-v1",
      "version": 1,
      "source": "levels-sample-first5.js:presetQueue",
      "levelNo": 4,
      "difficultyTier": 2,
      "difficultyMethod": "难度 2 级 → 目标 30 步；buildLaunchQueueLevel 生成 + 制作期颜色打散 + verifyQueuePlaythrough(18)",
      "target": 30,
      "seed": 3874135933,
      "mode": "far-to-near-balanced1",
      "groups": [
        {
          "id": "q1",
          "color": "D",
          "n": 3
        },
        {
          "id": "q2",
          "color": "N",
          "n": 15
        },
        {
          "id": "q3",
          "color": "B",
          "n": 14
        },
        {
          "id": "q4",
          "color": "C",
          "n": 15
        },
        {
          "id": "q5",
          "color": "B",
          "n": 22
        },
        {
          "id": "q6",
          "color": "C",
          "n": 14
        },
        {
          "id": "q7",
          "color": "B",
          "n": 15
        },
        {
          "id": "q8",
          "color": "H",
          "n": 7
        },
        {
          "id": "q9",
          "color": "C",
          "n": 14
        },
        {
          "id": "q10",
          "color": "B",
          "n": 19
        },
        {
          "id": "q11",
          "color": "B",
          "n": 14
        },
        {
          "id": "q12",
          "color": "C",
          "n": 13
        },
        {
          "id": "q13",
          "color": "B",
          "n": 23
        },
        {
          "id": "q14",
          "color": "B",
          "n": 15
        },
        {
          "id": "q15",
          "color": "B",
          "n": 20
        },
        {
          "id": "q16",
          "color": "B",
          "n": 21
        },
        {
          "id": "q17",
          "color": "M",
          "n": 13
        },
        {
          "id": "q18",
          "color": "B",
          "n": 12
        },
        {
          "id": "q19",
          "color": "C",
          "n": 15
        },
        {
          "id": "q20",
          "color": "B",
          "n": 9
        },
        {
          "id": "q21",
          "color": "B",
          "n": 7
        },
        {
          "id": "q22",
          "color": "M",
          "n": 16
        },
        {
          "id": "q23",
          "color": "B",
          "n": 11
        },
        {
          "id": "q24",
          "color": "B",
          "n": 19
        },
        {
          "id": "q25",
          "color": "C",
          "n": 11
        },
        {
          "id": "q26",
          "color": "B",
          "n": 12
        },
        {
          "id": "q27",
          "color": "P",
          "n": 15
        },
        {
          "id": "q28",
          "color": "N",
          "n": 16
        },
        {
          "id": "q29",
          "color": "B",
          "n": 19
        },
        {
          "id": "q30",
          "color": "C",
          "n": 13
        }
      ],
      "columns": [
        [
          "q1",
          "q2",
          "q3",
          "q4",
          "q5",
          "q6",
          "q7"
        ],
        [
          "q8",
          "q9",
          "q10",
          "q11",
          "q12",
          "q13",
          "q14"
        ],
        [
          "q15",
          "q16",
          "q17",
          "q18",
          "q19",
          "q20",
          "q21"
        ],
        [
          "q22",
          "q23",
          "q24",
          "q25",
          "q26",
          "q27",
          "q28",
          "q29",
          "q30"
        ]
      ],
      "verified": true,
      "check": {
        "ok": true,
        "reason": "ok",
        "filled": 432,
        "total": 432,
        "maxInFlight": 18
      },
      "scatter": {
        "applied": true,
        "variant": "balanced-shuffle-0",
        "attempt": 5,
        "seed": 1129265880,
        "metrics": {
          "distinctPerColumnAvg": 3.75,
          "visibleDistinctPerColumnAvg": 2.5,
          "sameColorColumns": 0,
          "maxSameColorRun": 2
        },
        "attempts": [
          {
            "variant": "balanced-shuffle-0",
            "ok": true,
            "reason": "ok",
            "metrics": {
              "distinctPerColumnAvg": 3.75,
              "visibleDistinctPerColumnAvg": 2.5,
              "sameColorColumns": 0,
              "maxSameColorRun": 2
            }
          }
        ]
      },
      "generation": {
        "source": "launch-sequence",
        "attempt": 1,
        "orderMode": "far-to-near",
        "solver": "min",
        "safety": false,
        "fallback": false,
        "colorScatter": {
          "applied": true,
          "variant": "balanced-shuffle-0",
          "attempt": 5,
          "seed": 1129265880,
          "metrics": {
            "distinctPerColumnAvg": 3.75,
            "visibleDistinctPerColumnAvg": 2.5,
            "sameColorColumns": 0,
            "maxSameColorRun": 2
          },
          "attempts": [
            {
              "variant": "balanced-shuffle-0",
              "ok": true,
              "reason": "ok",
              "metrics": {
                "distinctPerColumnAvg": 3.75,
                "visibleDistinctPerColumnAvg": 2.5,
                "sameColorColumns": 0,
                "maxSameColorRun": 2
              }
            }
          ]
        },
        "preset": {
          "schema": "ant-architect-preset-queue-v1",
          "builder": "tools/build-first5-levels.js",
          "generatedForLevel": 4,
          "difficultyTier": 2,
          "target": 30,
          "method": "难度 2 级 → 目标 30 步；buildLaunchQueueLevel 生成 + 制作期颜色打散 + verifyQueuePlaythrough(18)",
          "seed": 3874135933,
          "verifiedAtBuild": true
        }
      }
    }
  },
  {
    "id": "first-food-05-burger",
    "no": 5,
    "name": "汉堡",
    "theme": "first-foods",
    "themeIndex": 0,
    "themeName": "首组美食",
    "tag": "入门",
    "difficulty": 2,
    "difficultyTier": 2,
    "pixelUnit": 1,
    "colorCount": 6,
    "mechanic": "多层横带 · 盘底收口",
    "teaches": "面包、生菜、肉饼是横向长带；从最远的面包顶开始，盘底最后。",
    "hint": "长横带不要一次点太多列，留出中间的回填路。",
    "sample": true,
    "width": 26,
    "height": 20,
    "map": [
      "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBWWWHWWHWWWWWBBBBBBB",
      "BBBBBWWHWWWWWWWWHWWWWBBBBB",
      "BBBBWWWWWWWWWWWWWWHWWWBBBB",
      "BBBWWWWWWHWWWWWHWWWWWWWBBB",
      "BBBWWWWWWWWWWWWWWWWWWWWBBB",
      "BBBBWWWWWWWWWWWWWWWWWWBBBB",
      "BBBMMWMWMMWMMMWWMMMMWBMBBB",
      "BBBMMMMMMMMMMMMMMMMMMMMBBB",
      "BBBBHHHHHHHHHHHHHHHHHHBBBB",
      "BBBBBCCCCCCCCCCCCCCCCBBBBB",
      "BBBBBCCCWWWWWWWWWWCCCBBBBB",
      "BBSSSWWWWWWWWWWWWWWWWSSSBB",
      "BSSSSWWWWWWWWWWWWWWWWSSSSB",
      "BBSSSSSSWWWWWWWWWWSSSSSSBB",
      "BBBBBBSSSSSSSSSSSSSSBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBBBB"
    ],
    "colorCounts": {
      "B": 245,
      "W": 155,
      "H": 25,
      "M": 33,
      "C": 22,
      "S": 40
    },
    "presetQueue": {
      "schema": "ant-architect-preset-queue-v1",
      "version": 1,
      "source": "levels-sample-first5.js:presetQueue",
      "levelNo": 5,
      "difficultyTier": 2,
      "difficultyMethod": "难度 2 级 → 目标 30 步；buildLaunchQueueLevel 生成 + 制作期颜色打散 + verifyQueuePlaythrough(18)",
      "target": 30,
      "seed": 2300713420,
      "mode": "far-to-near-depth-first",
      "groups": [
        {
          "id": "q1",
          "color": "B",
          "n": 64
        },
        {
          "id": "q2",
          "color": "W",
          "n": 34
        },
        {
          "id": "q3",
          "color": "W",
          "n": 11
        },
        {
          "id": "q4",
          "color": "H",
          "n": 14
        },
        {
          "id": "q5",
          "color": "M",
          "n": 3
        },
        {
          "id": "q6",
          "color": "S",
          "n": 6
        },
        {
          "id": "q7",
          "color": "C",
          "n": 14
        },
        {
          "id": "q8",
          "color": "H",
          "n": 3
        },
        {
          "id": "q9",
          "color": "B",
          "n": 13
        },
        {
          "id": "q10",
          "color": "B",
          "n": 34
        },
        {
          "id": "q11",
          "color": "W",
          "n": 15
        },
        {
          "id": "q12",
          "color": "W",
          "n": 20
        },
        {
          "id": "q13",
          "color": "M",
          "n": 2
        },
        {
          "id": "q14",
          "color": "M",
          "n": 3
        },
        {
          "id": "q15",
          "color": "S",
          "n": 16
        },
        {
          "id": "q16",
          "color": "M",
          "n": 5
        },
        {
          "id": "q17",
          "color": "B",
          "n": 88
        },
        {
          "id": "q18",
          "color": "W",
          "n": 34
        },
        {
          "id": "q19",
          "color": "W",
          "n": 12
        },
        {
          "id": "q20",
          "color": "H",
          "n": 4
        },
        {
          "id": "q21",
          "color": "M",
          "n": 12
        },
        {
          "id": "q22",
          "color": "S",
          "n": 16
        },
        {
          "id": "q23",
          "color": "W",
          "n": 19
        },
        {
          "id": "q24",
          "color": "B",
          "n": 46
        },
        {
          "id": "q25",
          "color": "W",
          "n": 10
        },
        {
          "id": "q26",
          "color": "H",
          "n": 4
        },
        {
          "id": "q27",
          "color": "M",
          "n": 4
        },
        {
          "id": "q28",
          "color": "M",
          "n": 4
        },
        {
          "id": "q29",
          "color": "S",
          "n": 2
        },
        {
          "id": "q30",
          "color": "C",
          "n": 8
        }
      ],
      "columns": [
        [
          "q1",
          "q2",
          "q3",
          "q4",
          "q5",
          "q6",
          "q7"
        ],
        [
          "q8",
          "q9",
          "q10",
          "q11",
          "q12",
          "q13",
          "q14",
          "q15"
        ],
        [
          "q16",
          "q17",
          "q18",
          "q19",
          "q20",
          "q21",
          "q22"
        ],
        [
          "q23",
          "q24",
          "q25",
          "q26",
          "q27",
          "q28",
          "q29",
          "q30"
        ]
      ],
      "verified": true,
      "check": {
        "ok": true,
        "reason": "ok",
        "filled": 520,
        "total": 520,
        "maxInFlight": 18
      },
      "scatter": {
        "applied": true,
        "variant": "balanced-deal-0",
        "attempt": 2,
        "seed": 747093097,
        "metrics": {
          "distinctPerColumnAvg": 5.5,
          "visibleDistinctPerColumnAvg": 2.25,
          "sameColorColumns": 0,
          "maxSameColorRun": 2
        },
        "attempts": [
          {
            "variant": "balanced-smooth",
            "ok": false,
            "reason": "stuck",
            "metrics": {
              "distinctPerColumnAvg": 5.5,
              "visibleDistinctPerColumnAvg": 2.75,
              "sameColorColumns": 0,
              "maxSameColorRun": 1
            }
          },
          {
            "variant": "balanced-deal-0",
            "ok": true,
            "reason": "ok",
            "metrics": {
              "distinctPerColumnAvg": 5.5,
              "visibleDistinctPerColumnAvg": 2.25,
              "sameColorColumns": 0,
              "maxSameColorRun": 2
            }
          }
        ]
      },
      "generation": {
        "source": "launch-sequence",
        "attempt": 1,
        "orderMode": "far-to-near",
        "solver": "first",
        "safety": false,
        "fallback": false,
        "colorScatter": {
          "applied": true,
          "variant": "balanced-deal-0",
          "attempt": 2,
          "seed": 747093097,
          "metrics": {
            "distinctPerColumnAvg": 5.5,
            "visibleDistinctPerColumnAvg": 2.25,
            "sameColorColumns": 0,
            "maxSameColorRun": 2
          },
          "attempts": [
            {
              "variant": "balanced-smooth",
              "ok": false,
              "reason": "stuck",
              "metrics": {
                "distinctPerColumnAvg": 5.5,
                "visibleDistinctPerColumnAvg": 2.75,
                "sameColorColumns": 0,
                "maxSameColorRun": 1
              }
            },
            {
              "variant": "balanced-deal-0",
              "ok": true,
              "reason": "ok",
              "metrics": {
                "distinctPerColumnAvg": 5.5,
                "visibleDistinctPerColumnAvg": 2.25,
                "sameColorColumns": 0,
                "maxSameColorRun": 2
              }
            }
          ]
        },
        "preset": {
          "schema": "ant-architect-preset-queue-v1",
          "builder": "tools/build-first5-levels.js",
          "generatedForLevel": 5,
          "difficultyTier": 2,
          "target": 30,
          "method": "难度 2 级 → 目标 30 步；buildLaunchQueueLevel 生成 + 制作期颜色打散 + verifyQueuePlaythrough(18)",
          "seed": 2300713420,
          "verifiedAtBuild": true
        }
      }
    }
  }
];
  const SAMPLE_THEMES = [
  {
    "id": "first-foods",
    "name": "首组美食",
    "blurb": "本地样板：太阳蛋、西瓜角、糖霜甜甜圈、草莓、汉堡。原创像素画，等待确认。",
    "start": 1,
    "count": 5
  }
];
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SAMPLE_LEVELS: SAMPLE_LEVELS, SAMPLE_THEMES: SAMPLE_THEMES };
  } else {
    root.SAMPLE_LEVELS = SAMPLE_LEVELS;
    root.SAMPLE_THEMES = SAMPLE_THEMES;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

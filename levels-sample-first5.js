/*
 * 《蚂蚁小画家》feedback-2244 前 5 关 live 数据（对照本轮同步原图可见形态重做的原创像素画，2026-11-19）
 * 仅用于 ?sample=first5 本地试玩；不替换旧 200 关，不自动发布。
 * 每关 width / height 都是真实网格；颜色字符沿用 levels.js 的 MATERIALS。
 * 构图参考本轮同步的原图可见形态（参考输入只用于制作，不随玩家包发布）；
 * 不是像素级复刻，不包含官方品牌 / UI / 关卡排法，也没有把任何参考图片写进本文件或玩家包。
 * 本文件由 tools/build-first5-levels.js 生成；tools/first5-art-2244.js 是自制构图函数。
 * presetQueue 是制作期固定四列队列；运行期进入 / 刷新 / 重试 / 换 seed / 换设备只读这一份。
 */
(function (root) {
  const SAMPLE_LEVELS = [
  {
    "id": "first-food-01-sunEgg",
    "no": 1,
    "name": "太阳蛋",
    "theme": "first-foods",
    "themeIndex": 0,
    "themeName": "首组美食",
    "tag": "入门",
    "difficulty": 1,
    "difficultyTier": 1,
    "pixelUnit": 1,
    "colorCount": 5,
    "mechanic": "单色起步 · 远格先画",
    "teaches": "先点一枚令牌，小画家会从同色格中最远的一格开始画；这一关没有必须抢的顺序。",
    "hint": "任意一列第一排都能开工；等小画家落完再点下一枚，最稳。",
    "sample": true,
    "width": 26,
    "height": 22,
    "map": [
      "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBNNNNNNNBBBBBBBBB",
      "BBBBBBBBNNSSSSSSSNNBBBBBBB",
      "BBBBBBNNSSSSSSSSSSSNBBBBBB",
      "BBBBBNSSSSSSSHHSSSSSNBBBBB",
      "BBBBNSSSSSSSHHHHHSSSSNBBBB",
      "BBBBNSSSSSSHHHHHHHSSSSNBBB",
      "BBBBNSSSSSSHHHHHCHSSSSSNBB",
      "BBBBNSSSSSSSHHHCSSSSSSNBBB",
      "BBBBNSSSSSSSSSSSSSSSSSNBBB",
      "BBBNSSSSSSSSSSSSSSSSSNBBBB",
      "BBBNSSSSSSSSSSSSSSSNNBBBBB",
      "BBBNSSSSSSSSSSSSSSNBBBBBBB",
      "BBBBNNSSSSSSSSSSNNBBBBBBBB",
      "BBBBBBNNNNNNNNNNBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBBBB"
    ],
    "colorCounts": {
      "B": 352,
      "N": 47,
      "S": 148,
      "H": 23,
      "C": 2
    },
    "presetQueue": {
      "schema": "ant-architect-preset-queue-v1",
      "version": 1,
      "source": "levels-sample-first5.js:presetQueue",
      "levelNo": 1,
      "difficultyTier": 1,
      "difficultyMethod": "制作期固定四列；目标 10 步；宏步 DFS 可解 + 朴素策略对照（不是按 seed 运行时生成）",
      "target": 10,
      "seed": 8,
      "mode": "preset-fixed-designed-2244",
      "groups": [
        {
          "id": "q1",
          "color": "C",
          "n": 2
        },
        {
          "id": "q2",
          "color": "B",
          "n": 76
        },
        {
          "id": "q3",
          "color": "S",
          "n": 69
        },
        {
          "id": "q4",
          "color": "B",
          "n": 69
        },
        {
          "id": "q5",
          "color": "B",
          "n": 69
        },
        {
          "id": "q6",
          "color": "H",
          "n": 23
        },
        {
          "id": "q7",
          "color": "B",
          "n": 74
        },
        {
          "id": "q8",
          "color": "B",
          "n": 64
        },
        {
          "id": "q9",
          "color": "N",
          "n": 47
        },
        {
          "id": "q10",
          "color": "S",
          "n": 79
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
        "solver": "macro-settle-dfs",
        "filled": 572,
        "total": 572,
        "tokens": 10,
        "maxInFlight": null,
        "maxSlotUse": 2,
        "peakStalledTokens": 2,
        "searchMaxSlotUse": 2,
        "searchPeakStalledTokens": 2,
        "naiveFailures": 0
      },
      "scatter": {
        "applied": true,
        "variant": "designed-column-assignment",
        "pattern": "preset-scatter",
        "metrics": {
          "distinctPerColumnAvg": 2.25,
          "visibleDistinctPerColumnAvg": 2.25,
          "sameColorColumns": 0,
          "maxSameColorRun": 2
        }
      },
      "generation": {
        "source": "buildPresetQueue",
        "seed": 8,
        "assignment": "preset-scatter",
        "rawMode": "far-to-near-balanced1",
        "target": 10,
        "tokenCount": 10,
        "cells": 572,
        "avgCellsPerToken": 57.2,
        "difficulty": {
          "solutionLength": 10,
          "searchNodes": 11,
          "deadBranches": 0,
          "maxSlotUse": 2,
          "peakStalledTokens": 2,
          "searchMaxSlotUse": 2,
          "searchPeakStalledTokens": 2,
          "naiveFailures": []
        },
        "note": "运行期只读；解法路径与逐步 trace 只在本轮内部证据 JSON，不写入关卡数据，不写进玩家可见文本。"
      }
    },
    "minimumSteps": 10
  },
  {
    "id": "first-food-02-watermelon",
    "no": 2,
    "name": "西瓜角",
    "theme": "first-foods",
    "themeIndex": 0,
    "themeName": "首组美食",
    "tag": "入门",
    "difficulty": 2,
    "difficultyTier": 2,
    "pixelUnit": 1,
    "colorCount": 7,
    "mechanic": "瓜籽小岛 · 瓜皮留边",
    "teaches": "红瓤里的深色瓜籽是独立小岛；红瓤若先围拢，瓜籽就落不下。",
    "hint": "看到红瓤里的小色块，先把它点掉；再让红瓤和瓜皮收边。",
    "sample": true,
    "width": 24,
    "height": 20,
    "map": [
      "HHHHHHHHHHHHHHHHHHHHHHHH",
      "HHWHHHHHHWHHHHHHWHHHHHHW",
      "HHHHHHHHHHHHHHHHHHHHHHHH",
      "HHHHHHHHHHHHHHHHHHHHHHHH",
      "HHDDDDDDDDDDDDDDDDDDDDHH",
      "HHDDDDDDDDDDDDDDDDDDDDHH",
      "HHDLLLLLLLLLLLLLLLLLLDHH",
      "HHHLCCCCCCPPCCCCCCCCLHHH",
      "HHHLLCCCCNCCCCCNCCCLLHHH",
      "HHHDLCCCCCCCCCCCCCCLDHHH",
      "HHHHLCCCCCCCCCCCCCCLHHHH",
      "HHHHDLCNCCCCNCCCCNLDHHHH",
      "HHHHHLLCCCCCCPCCCLLHHHHH",
      "HHHHHDLLCCCCCCCCLLDHHHHH",
      "HHHHHHDLLLNCCCLLLDHHHHHH",
      "HHHHHHHDDLLLLLLDDHHHHHHH",
      "HHHHHHHHHDDDDDDHHHHHHHHH",
      "HHHHHHHHHHHHHHHHHHHHHHHH",
      "HHWHHHHHHWHHHHHHWHHHHHHW",
      "HHHHHHHHHHHHHHHHHHHHHHHH"
    ],
    "colorCounts": {
      "H": 270,
      "W": 8,
      "D": 60,
      "L": 50,
      "C": 83,
      "P": 3,
      "N": 6
    },
    "presetQueue": {
      "schema": "ant-architect-preset-queue-v1",
      "version": 1,
      "source": "levels-sample-first5.js:presetQueue",
      "levelNo": 2,
      "difficultyTier": 2,
      "difficultyMethod": "制作期固定四列；目标 12 步；宏步 DFS 可解 + 朴素策略对照（不是按 seed 运行时生成）",
      "target": 12,
      "seed": 3451071086,
      "mode": "preset-fixed-designed-2244",
      "groups": [
        {
          "id": "q1-1",
          "color": "N",
          "n": 6
        },
        {
          "id": "q1-2",
          "color": "W",
          "n": 8
        },
        {
          "id": "q1-3",
          "color": "C",
          "n": 44
        },
        {
          "id": "q2-1",
          "color": "L",
          "n": 50
        },
        {
          "id": "q2-2",
          "color": "H",
          "n": 47
        },
        {
          "id": "q2-3",
          "color": "H",
          "n": 48
        },
        {
          "id": "q2-4",
          "color": "H",
          "n": 60
        },
        {
          "id": "q3-1",
          "color": "C",
          "n": 39
        },
        {
          "id": "q3-2",
          "color": "H",
          "n": 66
        },
        {
          "id": "q3-3",
          "color": "H",
          "n": 49
        },
        {
          "id": "q4-1",
          "color": "P",
          "n": 3
        },
        {
          "id": "q4-2",
          "color": "D",
          "n": 60
        }
      ],
      "columns": [
        [
          "q1-1",
          "q1-2",
          "q1-3"
        ],
        [
          "q2-1",
          "q2-2",
          "q2-3",
          "q2-4"
        ],
        [
          "q3-1",
          "q3-2",
          "q3-3"
        ],
        [
          "q4-1",
          "q4-2"
        ]
      ],
      "verified": true,
      "check": {
        "ok": true,
        "reason": "ok",
        "solver": "macro-settle-dfs",
        "filled": 480,
        "total": 480,
        "tokens": 12,
        "maxInFlight": null,
        "maxSlotUse": 3,
        "peakStalledTokens": 3,
        "searchMaxSlotUse": 3,
        "searchPeakStalledTokens": 3,
        "naiveFailures": 1
      },
      "scatter": {
        "applied": true,
        "variant": "designed-column-assignment",
        "pattern": "rand4",
        "metrics": {
          "distinctPerColumnAvg": 2.25,
          "visibleDistinctPerColumnAvg": 2.25,
          "sameColorColumns": 0,
          "maxSameColorRun": 3
        }
      },
      "generation": {
        "source": "buildExactQueueLevel",
        "seed": 3451071086,
        "assignment": "rand4",
        "rawMode": "far-to-near-balanced1",
        "target": 12,
        "tokenCount": 12,
        "cells": 480,
        "avgCellsPerToken": 40,
        "difficulty": {
          "solutionLength": 12,
          "searchNodes": 13,
          "deadBranches": 0,
          "maxSlotUse": 3,
          "peakStalledTokens": 3,
          "searchMaxSlotUse": 3,
          "searchPeakStalledTokens": 3,
          "naiveFailures": [
            "largest"
          ]
        },
        "note": "运行期只读；解法路径与逐步 trace 只在本轮内部证据 JSON，不写入关卡数据，不写进玩家可见文本。"
      }
    },
    "minimumSteps": 12
  },
  {
    "id": "first-food-03-donut",
    "no": 3,
    "name": "糖霜甜甜圈",
    "theme": "first-foods",
    "themeIndex": 0,
    "themeName": "首组美食",
    "tag": "普通",
    "difficulty": 2,
    "difficultyTier": 2,
    "pixelUnit": 1,
    "colorCount": 8,
    "mechanic": "圆环空洞 · 糖针取舍",
    "teaches": "甜甜圈中心是空洞；糖针是粉霜上的小岛，五个待令位会被暂时卡住的令牌占住。",
    "hint": "别把五个待令位一次塞满；先让能落色的令牌开工，糖针会自己腾出位置。",
    "sample": true,
    "width": 24,
    "height": 22,
    "map": [
      "DDDLLLDDDLLLDDDLLLDDDLLL",
      "DDDLLLDDDLLLDDDLLLDDDLLL",
      "DDDLLLDDDLLLDDDLLLDDDLLL",
      "DDDLLLDDNNNNNNNNLLDDDLLL",
      "DDDLLLDNPPBPPSPPNLDDDLLL",
      "DDDLLNNPHPPPPPPPHNNDDLLL",
      "DDDLNPSBPPPSPPPPPPBNDLLL",
      "DDDLNPPPPPPNNPPPPPPNDLLL",
      "DDDNPPBPWNN##NNPPPPPNLLL",
      "DDDNPHPWN######NPHWPNLLL",
      "DDDNPPWWN######NHPWWNLLL",
      "DDDNPPWWN######NPWWWNLLL",
      "DDDNPPWWN######NWWWWNLLL",
      "DDDNPWWWWNN##NNWWWWWNLLL",
      "DDDLNWWWWWWNNWWWWWWNDLLL",
      "DDDLNWWWWWWWWWWWWWWNDLLL",
      "DDDLLNNWWWWWWWWWWNNDDLLL",
      "DDDLLLDNWWWWWWWWNLDDDLLL",
      "DDDLLLDDNNNNNNNNLLDDDLLL",
      "DDDLLLDDDLLLDDDLLLDDDLLL",
      "DDDLLLDDDLLLDDDLLLDDDLLL",
      "DDDLLLDDDLLLDDDLLLDDDLLL"
    ],
    "colorCounts": {
      "D": 146,
      "L": 146,
      "N": 68,
      "P": 57,
      "B": 4,
      "S": 3,
      "H": 5,
      "W": 71
    },
    "presetQueue": {
      "schema": "ant-architect-preset-queue-v1",
      "version": 1,
      "source": "levels-sample-first5.js:presetQueue",
      "levelNo": 3,
      "difficultyTier": 2,
      "difficultyMethod": "制作期固定四列；目标 12 步；宏步 DFS 可解 + 朴素策略对照（不是按 seed 运行时生成）",
      "target": 12,
      "seed": 2831980382,
      "mode": "preset-fixed-designed-2244",
      "groups": [
        {
          "id": "q1-1",
          "color": "S",
          "n": 3
        },
        {
          "id": "q1-2",
          "color": "N",
          "n": 68
        },
        {
          "id": "q1-3",
          "color": "L",
          "n": 44
        },
        {
          "id": "q1-4",
          "color": "L",
          "n": 57
        },
        {
          "id": "q2-1",
          "color": "H",
          "n": 5
        },
        {
          "id": "q2-2",
          "color": "L",
          "n": 45
        },
        {
          "id": "q2-3",
          "color": "D",
          "n": 45
        },
        {
          "id": "q2-4",
          "color": "D",
          "n": 49
        },
        {
          "id": "q3-1",
          "color": "W",
          "n": 71
        },
        {
          "id": "q3-2",
          "color": "D",
          "n": 52
        },
        {
          "id": "q4-1",
          "color": "B",
          "n": 4
        },
        {
          "id": "q4-2",
          "color": "P",
          "n": 57
        }
      ],
      "columns": [
        [
          "q1-1",
          "q1-2",
          "q1-3",
          "q1-4"
        ],
        [
          "q2-1",
          "q2-2",
          "q2-3",
          "q2-4"
        ],
        [
          "q3-1",
          "q3-2"
        ],
        [
          "q4-1",
          "q4-2"
        ]
      ],
      "verified": true,
      "check": {
        "ok": true,
        "reason": "ok",
        "solver": "macro-settle-dfs",
        "filled": 500,
        "total": 500,
        "tokens": 12,
        "maxInFlight": null,
        "maxSlotUse": 4,
        "peakStalledTokens": 4,
        "searchMaxSlotUse": 5,
        "searchPeakStalledTokens": 5,
        "naiveFailures": 3
      },
      "scatter": {
        "applied": true,
        "variant": "designed-column-assignment",
        "pattern": "rand2",
        "metrics": {
          "distinctPerColumnAvg": 2.5,
          "visibleDistinctPerColumnAvg": 2.5,
          "sameColorColumns": 0,
          "maxSameColorRun": 2
        }
      },
      "generation": {
        "source": "buildExactQueueLevel",
        "seed": 2831980382,
        "assignment": "rand2",
        "rawMode": "far-to-near-balanced1",
        "target": 12,
        "tokenCount": 12,
        "cells": 500,
        "avgCellsPerToken": 41.7,
        "difficulty": {
          "solutionLength": 12,
          "searchNodes": 16,
          "deadBranches": 2,
          "maxSlotUse": 4,
          "peakStalledTokens": 4,
          "searchMaxSlotUse": 5,
          "searchPeakStalledTokens": 5,
          "naiveFailures": [
            "left",
            "largest",
            "allheads"
          ]
        },
        "note": "运行期只读；解法路径与逐步 trace 只在本轮内部证据 JSON，不写入关卡数据，不写进玩家可见文本。"
      }
    },
    "minimumSteps": 12
  },
  {
    "id": "first-food-04-strawberry",
    "no": 4,
    "name": "草莓",
    "theme": "first-foods",
    "themeIndex": 0,
    "themeName": "首组美食",
    "tag": "普通",
    "difficulty": 2,
    "difficultyTier": 2,
    "pixelUnit": 1,
    "colorCount": 9,
    "mechanic": "棋格通道 · 果籽留孔",
    "teaches": "蓝白棋格把背景切成窄道；草莓籽是红果肉里的小岛，先处理小岛再收果肉。",
    "hint": "先点能落色的小令牌，别让红果肉把籽封在里面；待令位满之前停一下。",
    "sample": true,
    "width": 22,
    "height": 24,
    "map": [
      "SSBBSSBBSSBBSSBBSSBBSS",
      "SSBBSSBBSSBDSSBBSSBBSS",
      "BBSSBBSSBBSDBBSSBBSSBB",
      "BBSSBBSSBBMMMBSSBBSSBB",
      "SSBBSSBBMLLMLLMBSSBBSS",
      "SSBBSSMMLMMLMMLMMSBBSS",
      "BBSSBMMLMMLMMMLMMMSSBB",
      "BBSSBMSDDDDDDDDDBMSSBB",
      "SSBBSSNNNNNNNNNNSSBBSS",
      "SSBBSNPPPNNCCCCCNSBBSS",
      "BBSSNPPPHNNCCHCCCNSSBB",
      "BBSSNPPPPNNCCCCCCNSSBB",
      "SSBBNPHPPNNHCCCCCNBBSS",
      "SSBBSNPPPNNCCCCHCNBBSS",
      "BBSSBNPPHNNCCCCCNBSSBB",
      "BBSSBBNPPNNCHCCCNBSSBB",
      "SSBBSSNPPNNCCCCNSSBBSS",
      "SSBBSSBNPNNCCCHNSSBBSS",
      "BBSSBBSNPNNCHCNSBBSSBB",
      "BBSSBBSSNNNCCNSSBBSSBB",
      "SSBBSSBBSNNHNSBBSSBBSS",
      "SSBBSSBBSSNCNSBBSSBBSS",
      "BBSSBBSSBBSNBBSSBBSSBB",
      "BBSSBBSSBBSSBBSSBBSSBB"
    ],
    "colorCounts": {
      "S": 174,
      "B": 166,
      "D": 11,
      "M": 26,
      "L": 10,
      "N": 60,
      "P": 24,
      "C": 47,
      "H": 10
    },
    "presetQueue": {
      "schema": "ant-architect-preset-queue-v1",
      "version": 1,
      "source": "levels-sample-first5.js:presetQueue",
      "levelNo": 4,
      "difficultyTier": 2,
      "difficultyMethod": "制作期固定四列；目标 14 步；宏步 DFS 可解 + 朴素策略对照（不是按 seed 运行时生成）",
      "target": 14,
      "seed": 837725202,
      "mode": "preset-fixed-designed-2244",
      "groups": [
        {
          "id": "q1-1",
          "color": "L",
          "n": 10
        },
        {
          "id": "q1-2",
          "color": "D",
          "n": 11
        },
        {
          "id": "q1-3",
          "color": "C",
          "n": 47
        },
        {
          "id": "q2-1",
          "color": "N",
          "n": 31
        },
        {
          "id": "q2-2",
          "color": "B",
          "n": 56
        },
        {
          "id": "q2-3",
          "color": "S",
          "n": 67
        },
        {
          "id": "q3-1",
          "color": "M",
          "n": 26
        },
        {
          "id": "q3-2",
          "color": "S",
          "n": 53
        },
        {
          "id": "q3-3",
          "color": "S",
          "n": 54
        },
        {
          "id": "q4-1",
          "color": "H",
          "n": 10
        },
        {
          "id": "q4-2",
          "color": "P",
          "n": 24
        },
        {
          "id": "q4-3",
          "color": "N",
          "n": 29
        },
        {
          "id": "q4-4",
          "color": "B",
          "n": 58
        },
        {
          "id": "q4-5",
          "color": "B",
          "n": 52
        }
      ],
      "columns": [
        [
          "q1-1",
          "q1-2",
          "q1-3"
        ],
        [
          "q2-1",
          "q2-2",
          "q2-3"
        ],
        [
          "q3-1",
          "q3-2",
          "q3-3"
        ],
        [
          "q4-1",
          "q4-2",
          "q4-3",
          "q4-4",
          "q4-5"
        ]
      ],
      "verified": true,
      "check": {
        "ok": true,
        "reason": "ok",
        "solver": "macro-settle-dfs",
        "filled": 528,
        "total": 528,
        "tokens": 14,
        "maxInFlight": null,
        "maxSlotUse": 4,
        "peakStalledTokens": 4,
        "searchMaxSlotUse": 5,
        "searchPeakStalledTokens": 5,
        "naiveFailures": 3
      },
      "scatter": {
        "applied": true,
        "variant": "designed-column-assignment",
        "pattern": "rand4",
        "metrics": {
          "distinctPerColumnAvg": 3,
          "visibleDistinctPerColumnAvg": 2.75,
          "sameColorColumns": 0,
          "maxSameColorRun": 2
        }
      },
      "generation": {
        "source": "buildExactQueueLevel",
        "seed": 837725202,
        "assignment": "rand4",
        "rawMode": "far-to-near-balanced1",
        "target": 14,
        "tokenCount": 14,
        "cells": 528,
        "avgCellsPerToken": 37.7,
        "difficulty": {
          "solutionLength": 14,
          "searchNodes": 18,
          "deadBranches": 1,
          "maxSlotUse": 4,
          "peakStalledTokens": 4,
          "searchMaxSlotUse": 5,
          "searchPeakStalledTokens": 5,
          "naiveFailures": [
            "left",
            "right",
            "largest"
          ]
        },
        "note": "运行期只读；解法路径与逐步 trace 只在本轮内部证据 JSON，不写入关卡数据，不写进玩家可见文本。"
      }
    },
    "minimumSteps": 14
  },
  {
    "id": "first-food-05-burger",
    "no": 5,
    "name": "迷你汉堡",
    "theme": "first-foods",
    "themeIndex": 0,
    "themeName": "首组美食",
    "tag": "困难",
    "difficulty": 2,
    "difficultyTier": 2,
    "pixelUnit": 1,
    "colorCount": 8,
    "mechanic": "多层咬合 · 五格取舍",
    "teaches": "面包、生菜、芝士、番茄、肉饼互相咬合；五格待令位可能同时被暂时落不下的令牌占满。",
    "hint": "先让至少一枚令牌有落点；暂时落不下的先别点，等能落色的令牌腾出位置。",
    "sample": true,
    "width": 24,
    "height": 20,
    "map": [
      "BBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBBBBBBBBBBB",
      "BBBBBBBBNWWWWWWNBBBBBBBB",
      "BBBBBBNWWSWWWSWWWNBBBBBB",
      "BBBBNWWWWWWWSWWWSWWNBBBB",
      "BBBNWWWSWWWSWWWSWWWWWNBB",
      "BBNWWWWWWSWWWWSWWWWWWNBB",
      "BBNWWWMWWWWWMWWWWWMWWWNB",
      "BBBNMBMBMBMMMBBMMBMMNBBB",
      "BBBNMMMMMMMMMMMMMMMMNBBB",
      "BBBNHHHHHHHHHHHHHHHHNBBB",
      "BBBNBHBBBHBBBMHBBBHBNBBB",
      "BBBNPPPPPPPPPPPPPPPPNBBB",
      "BBBNCCCHCCCCHCCCCHCCNBBB",
      "BBBNCCCCCCCCCCCCCCCCNBBB",
      "BBBNWWWWWWWWWWWWWWWWNBBB",
      "BBBNBWWWWWWWWWWWWWWBNBBB",
      "BBBNBBBWWWWWWWWWWBBBNBBB"
    ],
    "colorCounts": {
      "B": 229,
      "N": 32,
      "W": 112,
      "S": 9,
      "M": 30,
      "H": 23,
      "P": 16,
      "C": 29
    },
    "presetQueue": {
      "schema": "ant-architect-preset-queue-v1",
      "version": 1,
      "source": "levels-sample-first5.js:presetQueue",
      "levelNo": 5,
      "difficultyTier": 2,
      "difficultyMethod": "制作期固定四列；目标 16 步；宏步 DFS 可解 + 朴素策略对照（不是按 seed 运行时生成）",
      "target": 16,
      "seed": 3874135933,
      "mode": "preset-fixed-designed-2244",
      "groups": [
        {
          "id": "q1-1",
          "color": "N",
          "n": 32
        },
        {
          "id": "q1-2",
          "color": "B",
          "n": 42
        },
        {
          "id": "q2-1",
          "color": "W",
          "n": 38
        },
        {
          "id": "q2-2",
          "color": "B",
          "n": 20
        },
        {
          "id": "q2-3",
          "color": "B",
          "n": 38
        },
        {
          "id": "q3-1",
          "color": "S",
          "n": 9
        },
        {
          "id": "q3-2",
          "color": "H",
          "n": 23
        },
        {
          "id": "q3-3",
          "color": "M",
          "n": 30
        },
        {
          "id": "q3-4",
          "color": "C",
          "n": 29
        },
        {
          "id": "q3-5",
          "color": "W",
          "n": 32
        },
        {
          "id": "q3-6",
          "color": "B",
          "n": 36
        },
        {
          "id": "q3-7",
          "color": "B",
          "n": 27
        },
        {
          "id": "q3-8",
          "color": "B",
          "n": 34
        },
        {
          "id": "q4-1",
          "color": "P",
          "n": 16
        },
        {
          "id": "q4-2",
          "color": "W",
          "n": 42
        },
        {
          "id": "q4-3",
          "color": "B",
          "n": 32
        }
      ],
      "columns": [
        [
          "q1-1",
          "q1-2"
        ],
        [
          "q2-1",
          "q2-2",
          "q2-3"
        ],
        [
          "q3-1",
          "q3-2",
          "q3-3",
          "q3-4",
          "q3-5",
          "q3-6",
          "q3-7",
          "q3-8"
        ],
        [
          "q4-1",
          "q4-2",
          "q4-3"
        ]
      ],
      "verified": true,
      "check": {
        "ok": true,
        "reason": "ok",
        "solver": "macro-settle-dfs",
        "filled": 480,
        "total": 480,
        "tokens": 16,
        "maxInFlight": null,
        "maxSlotUse": 3,
        "peakStalledTokens": 3,
        "searchMaxSlotUse": 5,
        "searchPeakStalledTokens": 5,
        "naiveFailures": 4
      },
      "scatter": {
        "applied": true,
        "variant": "designed-column-assignment",
        "pattern": "rand2",
        "metrics": {
          "distinctPerColumnAvg": 3.25,
          "visibleDistinctPerColumnAvg": 2.5,
          "sameColorColumns": 0,
          "maxSameColorRun": 3
        }
      },
      "generation": {
        "source": "buildExactQueueLevel",
        "seed": 3874135933,
        "assignment": "rand2",
        "rawMode": "far-to-near-balanced1",
        "target": 16,
        "tokenCount": 16,
        "cells": 480,
        "avgCellsPerToken": 30,
        "difficulty": {
          "solutionLength": 16,
          "searchNodes": 987,
          "deadBranches": 374,
          "maxSlotUse": 3,
          "peakStalledTokens": 3,
          "searchMaxSlotUse": 5,
          "searchPeakStalledTokens": 5,
          "naiveFailures": [
            "left",
            "round",
            "largest",
            "allheads"
          ]
        },
        "note": "运行期只读；解法路径与逐步 trace 只在本轮内部证据 JSON，不写入关卡数据，不写进玩家可见文本。"
      }
    },
    "minimumSteps": 16
  }
];
  const SAMPLE_THEMES = [
  {
    "id": "first-foods",
    "name": "首组美食",
    "blurb": "对照原图可见形态重做的 5 关原创像素画：太阳蛋、西瓜角、糖霜甜甜圈、草莓、迷你汉堡。固定四列令牌，按机制取舍排难度。",
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

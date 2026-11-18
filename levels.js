/*
 * 《蚂蚁小画师》关卡数据 v6（2026-11-18 20:46–21:14 反馈版）
 * 本轮为每关补充 mechanic 标签，用于逐步引入机制；原图与队列不变。
 * 5 张原创 30×30 满盘像素原图：所有 900 格都参与拼图，没有纸色留白。
 * 地图字符：
 *   C 赤陶  W 木枝  M 苔藓  H 蜜蜡  B 月蓝  P 萤粉  S 岩灰
 *   N 夜青  D 深苔  L 浅叶  V 暮紫
 * 队列：每列从上到下；预选区只画前三枚，其余实时显示「+N令」。
 * 本文件由 tools/build-levels.js 生成；改原图后重新运行生成器。
 */
(function (root) {
  const MATERIALS = {
    C: { key: 'C', name: '赤陶', short: '陶' },
    W: { key: 'W', name: '木枝', short: '木' },
    M: { key: 'M', name: '苔藓', short: '苔' },
    H: { key: 'H', name: '蜜蜡', short: '蜡' },
    B: { key: 'B', name: '月蓝', short: '蓝' },
    P: { key: 'P', name: '萤粉', short: '萤' },
    S: { key: 'S', name: '岩灰', short: '岩' },
    N: { key: 'N', name: '夜青', short: '夜' },
    D: { key: 'D', name: '深苔', short: '深' },
    L: { key: 'L', name: '浅叶', short: '浅' },
    V: { key: 'V', name: '暮紫', short: '暮' }
  };

  const LEVELS = [
  {
    id: "lamp",
    no: 1,
    name: "赤陶小灯",
    tag: "入门",
    teaches: "点每列第一排的令牌；小画师会提颜料桶去填同色格。",
    mechanic: "取令与派工",
    hint: "先点任意一列第一排的令牌。长按任一枚令牌，可临时看同色位置。",
    map: [
      "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
      "NNNNNNNNNNNNNNNNNNNNNNNNHNNNNN",
      "NNNNNNNNNNNNNNSSNNNNNNHHHHHNNN",
      "NNNSSNNNNNNNNNSSNNNNNHSSHHHHNN",
      "NNNSSNNNNNNNNNNNNNNNNHSSHHHHNN",
      "NNNNNNNNNNNNNNNNNNNNHHHHHHHHHN",
      "NNNNNNNNHHNNNNNNNNNNNHHHHSSHNN",
      "NNNNNNNNHHNNNNNNNNNNHHHHHSSHNN",
      "NNNNNNNNNNNNNNNNNNNNHHHHHHHNNN",
      "NNNNNNNNNNNNNNNNNNNNNNNNHNNNNN",
      "NNNNNHHNNNNNNNNNNNNNNNNNHHNNNN",
      "NNNNNHHNNNNNNNNNNSSNNNNNHHNNNN",
      "NNNNNNNNNNNNNNNHNSSNNNNNNNNNNN",
      "BBBBBBBBBBBBBBPPPBBBBBBBBBBBBB",
      "BBBBBBBBBBBBBBPPPBBBBBBBBBBBBB",
      "BBBBBBBBBPPBBBPPPBBPPBBBBBBBBB",
      "BBBBBBBBBPPBBWWWWBBPPDDDBBBBBB",
      "BBBBBBBBDDDDCWWWWCBDDDDDDBBBBB",
      "BBBBBBBDDDDDCCCCCCDDDDDDDDBBBB",
      "DBBBBMMDDDDDCCHHHCDDDDDDDDDDBB",
      "DDLLDMMDDHHDCCHHHCDHHDDDDDDDDD",
      "DDLLMMMDDHHDCCHHHCDHHDDDDDDDDD",
      "MMMMMMMMMMMMCCCCCCMMMMMMMMMMMM",
      "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
      "MMCCCCCWWWWWWWWWWWWWWWWWWWMLLM",
      "MMCCCCCWWWWWWWWWWWWWWWWWWWMLLM",
      "MMCCCCCMMMMMMMMMMMMMMMMCCMMSSS",
      "MLLLMCCMMMMMMMMMMMMMMMMCCMMSSS",
      "LLLLLCCLLLLLLLLLLLLLLLLCCLLLLL",
      "LLLLLLLLLLLLLLLLLLLLLLLLLLLLLL"
    ],
    groups: [
      {
        id: "px18",
        color: "P",
        n: 9
      },
      {
        id: "wx4",
        color: "W",
        n: 8
      },
      {
        id: "hx12",
        color: "H",
        n: 1
      },
      {
        id: "sx25",
        color: "S",
        n: 4
      },
      {
        id: "px19",
        color: "P",
        n: 4
      },
      {
        id: "px20",
        color: "P",
        n: 4
      },
      {
        id: "hx13",
        color: "H",
        n: 9
      },
      {
        id: "hx14",
        color: "H",
        n: 4
      },
      {
        id: "hx15",
        color: "H",
        n: 4
      },
      {
        id: "cx1",
        color: "C",
        n: 23
      },
      {
        id: "dx31",
        color: "D",
        n: 20
      },
      {
        id: "hx10",
        color: "H",
        n: 4
      },
      {
        id: "hx11",
        color: "H",
        n: 4
      },
      {
        id: "wx5",
        color: "W",
        n: 38
      },
      {
        id: "nx29",
        color: "N",
        n: 1
      },
      {
        id: "dx33",
        color: "D",
        n: 1
      },
      {
        id: "sx22",
        color: "S",
        n: 4
      },
      {
        id: "sx23",
        color: "S",
        n: 4
      },
      {
        id: "sx24",
        color: "S",
        n: 4
      },
      {
        id: "mx7",
        color: "M",
        n: 32
      },
      {
        id: "sx21",
        color: "S",
        n: 4
      },
      {
        id: "lx34",
        color: "L",
        n: 4
      },
      {
        id: "mx8",
        color: "M",
        n: 1
      },
      {
        id: "hx9",
        color: "H",
        n: 48
      },
      {
        id: "cx2",
        color: "C",
        n: 19
      },
      {
        id: "cx3",
        color: "C",
        n: 6
      },
      {
        id: "lx35",
        color: "L",
        n: 4
      },
      {
        id: "bx16",
        color: "B",
        n: 70
      },
      {
        id: "nx28",
        color: "N",
        n: 92
      },
      {
        id: "bx17",
        color: "B",
        n: 57
      },
      {
        id: "nx27",
        color: "N",
        n: 220
      },
      {
        id: "dx30",
        color: "D",
        n: 47
      },
      {
        id: "mx6",
        color: "M",
        n: 76
      },
      {
        id: "lx36",
        color: "L",
        n: 59
      },
      {
        id: "sx26",
        color: "S",
        n: 6
      },
      {
        id: "dx32",
        color: "D",
        n: 5
      }
    ],
    columns: [
      [
        "px18",
        "wx4",
        "hx12",
        "sx25",
        "px19",
        "px20",
        "hx13",
        "hx14",
        "hx15"
      ],
      [
        "cx1",
        "dx31",
        "hx10",
        "hx11",
        "wx5",
        "nx29",
        "dx33",
        "sx22",
        "sx23"
      ],
      [
        "sx24",
        "mx7",
        "sx21",
        "lx34",
        "mx8",
        "hx9",
        "cx2",
        "cx3",
        "lx35"
      ],
      [
        "bx16",
        "nx28",
        "bx17",
        "nx27",
        "dx30",
        "mx6",
        "lx36",
        "sx26",
        "dx32"
      ]
    ]
  },
  {
    id: "well",
    no: 2,
    name: "苔痕井栏",
    tag: "等待",
    teaches: "一枚令牌没填完，就先在待令区等；内部拼完后会自动继续。",
    mechanic: "封口等待",
    hint: "外圈最后一块会留在待令区，等井心填完再继续，不会封口。",
    map: [
      "BMMMMMMMMMMMMMMMMMMMMMMMMMMMMB",
      "BMMMMMMMMMMMCCCCCCMMMMMMMMMMMB",
      "BMLLMMLLMMLLCCCCCCLLMMLLMMLLMB",
      "BBLLBMLLCCCCCCCCCCCCCCLLMBLLBB",
      "BBBBBBBBCCCCCCCCCCCCCCMMMBBBBB",
      "DDDDDDWWWWWWWWWWWWWWWWWWDDDDDD",
      "DDDDDDWWWWWWWWWWWWWWWWWWDDDDDD",
      "DDDDDDDWWDDDDDWWDDDDDWWDDDDDDD",
      "DDDDDDDWWDDDDDWWDDDDDWWDDDDDDD",
      "DDDDDDDWWDDDDDWWDDDDDWWDDDDDDD",
      "DDDDLLDWWDDDDDWWDDDDDWWDDDDDDD",
      "DDDDLLDWWDDSSSWWSSSSDWLLDDDDDD",
      "DDDDDDDWWDSSSCHHCSSSSWLLDDDDDD",
      "DDDDDDDWWSSSSCCCCSSSSWWDDDDDDD",
      "DDDDDDDWHHSSSCCCCSSSSWWDDDDDDD",
      "DDDDDDDWHHSSNNNNNNNSSWWSDHHDDD",
      "DDDDDDDWWSSNNNNNNNNNSWWSDHHDDD",
      "DDDDDDMMMSSNNNNNNNNNSMMMDDDDDD",
      "DDLLDDMMMSSNNBBNNNNNSMMMDDDDDD",
      "DDLLDDSSSSNNNBBNNNNNNSSSSDDDDD",
      "DDDDDDDSSSSNNNNNNBBNSSSSDDDHHD",
      "DDDDDDDSSSSNNNNNNBBNSSSSDDDHHD",
      "MMSSSSMSSSSNNNNNNNNNSSSSSSSSMM",
      "MMSSSSMSSSSSNNNNNNNSSSSSSSSSMM",
      "MMMMMMMMSSHHSSSNSSSPPSSMHHMMMM",
      "MMMHHMMMMSHHSSNNNSSPPSMMHHMMMM",
      "MLLLHMMMMMSSWWNNNWWSSMMMMMPPMM",
      "MLLLMPPMMMMMMMNNNMMMMMMMMMLLLM",
      "LLLLLPPLLLLMMMCCCMMMLLLLLLLLLL",
      "LLLLLLLLLLLLWWNNNWWLLLLLLLLLLL"
    ],
    groups: [
      {
        id: "cx2",
        color: "C",
        n: 10
      },
      {
        id: "hx16",
        color: "H",
        n: 2
      },
      {
        id: "bx25",
        color: "B",
        n: 4
      },
      {
        id: "sx31",
        color: "S",
        n: 21
      },
      {
        id: "hx17",
        color: "H",
        n: 4
      },
      {
        id: "bx26",
        color: "B",
        n: 4
      },
      {
        id: "dx43",
        color: "D",
        n: 23
      },
      {
        id: "dx44",
        color: "D",
        n: 21
      },
      {
        id: "mx10",
        color: "M",
        n: 6
      },
      {
        id: "mx11",
        color: "M",
        n: 6
      },
      {
        id: "lx52",
        color: "L",
        n: 4
      },
      {
        id: "sx32",
        color: "S",
        n: 2
      },
      {
        id: "wx4",
        color: "W",
        n: 82
      },
      {
        id: "sx30",
        color: "S",
        n: 45
      },
      {
        id: "sx35",
        color: "S",
        n: 5
      },
      {
        id: "sx36",
        color: "S",
        n: 5
      },
      {
        id: "hx20",
        color: "H",
        n: 4
      },
      {
        id: "hx21",
        color: "H",
        n: 4
      },
      {
        id: "px27",
        color: "P",
        n: 4
      },
      {
        id: "lx51",
        color: "L",
        n: 4
      },
      {
        id: "hx18",
        color: "H",
        n: 4
      },
      {
        id: "hx22",
        color: "H",
        n: 3
      },
      {
        id: "wx5",
        color: "W",
        n: 2
      },
      {
        id: "wx6",
        color: "W",
        n: 2
      },
      {
        id: "sx37",
        color: "S",
        n: 2
      },
      {
        id: "sx38",
        color: "S",
        n: 2
      },
      {
        id: "nx39",
        color: "N",
        n: 81
      },
      {
        id: "sx33",
        color: "S",
        n: 32
      },
      {
        id: "sx34",
        color: "S",
        n: 8
      },
      {
        id: "lx45",
        color: "L",
        n: 4
      },
      {
        id: "lx46",
        color: "L",
        n: 4
      },
      {
        id: "lx49",
        color: "L",
        n: 4
      },
      {
        id: "lx50",
        color: "L",
        n: 4
      },
      {
        id: "lx53",
        color: "L",
        n: 4
      },
      {
        id: "px28",
        color: "P",
        n: 2
      },
      {
        id: "lx47",
        color: "L",
        n: 2
      },
      {
        id: "lx48",
        color: "L",
        n: 2
      },
      {
        id: "mx15",
        color: "M",
        n: 1
      },
      {
        id: "mx14",
        color: "M",
        n: 20
      },
      {
        id: "cx1",
        color: "C",
        n: 40
      },
      {
        id: "hx19",
        color: "H",
        n: 4
      },
      {
        id: "px29",
        color: "P",
        n: 4
      },
      {
        id: "cx3",
        color: "C",
        n: 3
      },
      {
        id: "dx41",
        color: "D",
        n: 106
      },
      {
        id: "dx42",
        color: "D",
        n: 99
      },
      {
        id: "mx12",
        color: "M",
        n: 38
      },
      {
        id: "mx9",
        color: "M",
        n: 65
      },
      {
        id: "bx23",
        color: "B",
        n: 14
      },
      {
        id: "bx24",
        color: "B",
        n: 11
      },
      {
        id: "lx54",
        color: "L",
        n: 27
      },
      {
        id: "mx13",
        color: "M",
        n: 15
      },
      {
        id: "lx55",
        color: "L",
        n: 24
      },
      {
        id: "nx40",
        color: "N",
        n: 3
      },
      {
        id: "wx7",
        color: "W",
        n: 2
      },
      {
        id: "wx8",
        color: "W",
        n: 2
      }
    ],
    columns: [
      [
        "cx2",
        "hx16",
        "bx25",
        "sx31",
        "hx17",
        "bx26",
        "dx43",
        "dx44",
        "mx10",
        "mx11",
        "lx52",
        "sx32",
        "wx4",
        "sx30"
      ],
      [
        "sx35",
        "sx36",
        "hx20",
        "hx21",
        "px27",
        "lx51",
        "hx18",
        "hx22",
        "wx5",
        "wx6",
        "sx37",
        "sx38",
        "nx39",
        "sx33"
      ],
      [
        "sx34",
        "lx45",
        "lx46",
        "lx49",
        "lx50",
        "lx53",
        "px28",
        "lx47",
        "lx48",
        "mx15",
        "mx14",
        "cx1",
        "hx19",
        "px29"
      ],
      [
        "cx3",
        "dx41",
        "dx42",
        "mx12",
        "mx9",
        "bx23",
        "bx24",
        "lx54",
        "mx13",
        "lx55",
        "nx40",
        "wx7",
        "wx8"
      ]
    ]
  },
  {
    id: "seedbox",
    no: 3,
    name: "空腔种子匣",
    tag: "抽匣",
    teaches: "抽开的种子匣，空腔与盘外连通；先填里面，再收匣身。",
    mechanic: "多色并行",
    hint: "匣心与匣口连通，先从里面填；外层匣身会自己收尾。",
    map: [
      "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
      "SSSSLLLSSSSSSSSSSSSSSSSSSSSSSS",
      "SMMMLLLSSSSSSSSSSSSSSSSSSSMMMS",
      "SMMMSSSSSSSSSSSSSSSSSSSSSSMMMS",
      "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
      "SSSSSSSSSSSSSSSSSSSSSSSSLLLSSS",
      "SSSCCWWWWWWWWWWWWWWWWWWWWCCSSS",
      "SSSCCWWWWWWWSSHHSSWWWWWWWCCSSS",
      "SMMCCCCCCCCCSSSSSSCCCCCCCCCLLL",
      "SMMMCCCCCCCCCSSSSCCCCCCCCCSLLL",
      "SSSSCCCCCCCCCSSSSCCCCCCCCCSSSS",
      "SSSSCCWWWWWWWWWWWWWWWWWWCCSSSS",
      "SSSSCCWWWWWWWWWWWWWWWWWWCCSMMS",
      "SSSSCCWWNNNNNNNNNNNNNNWWCCSMMS",
      "SSMMCCWWNNNNNNNNNNNNNNWWCCSSSS",
      "SSMMCCHHNNHHHHNPPPPNNNWWCCLLLS",
      "SSSSCCHHNNHHHHNPPPPNNNHHCCLLLS",
      "SSSSCCWWNNHHHHNPPPPNHHHHCCSSSS",
      "SSSSCCWWNNNNNNNNNNNNHHHHCCSSSS",
      "SSSSCCWWNNMMMMNLLLLNHHWWCCSSSS",
      "BBBBCCWWNNMMMMNLLLLNNNWWCCBBBB",
      "BBBBCCHHNNCNNNNNNNNCNNWWCCBBBB",
      "BBBBCCHHNNCNNNNNNNNCNNWWCCBBBB",
      "BHHBCCWWWWCNNNNNNNNCWWWWCCBPPB",
      "BHHBCCWWWWCNNNNNNNNCWWWWCCBPPB",
      "BBBBCCCCCCCNNNNNNNNCCCCCCCBBBB",
      "DDDDCCCCCCCNNNNNNNNCCCCCCCDDDD",
      "DDDDDCCCDDCNNNNNNNNCDDCCCDDDDD",
      "DDDDDCCCDDCNWWWWWWNCDDCCCDDDDD",
      "DDDDDDDDDDCNNHHHHNNCDDDDDDDDDD"
    ],
    groups: [
      {
        id: "px24",
        color: "P",
        n: 12
      },
      {
        id: "hx17",
        color: "H",
        n: 12
      },
      {
        id: "mx14",
        color: "M",
        n: 8
      },
      {
        id: "lx36",
        color: "L",
        n: 8
      },
      {
        id: "sx27",
        color: "S",
        n: 18
      },
      {
        id: "hx15",
        color: "H",
        n: 2
      },
      {
        id: "wx4",
        color: "W",
        n: 46
      },
      {
        id: "hx18",
        color: "H",
        n: 12
      },
      {
        id: "wx5",
        color: "W",
        n: 8
      },
      {
        id: "hx16",
        color: "H",
        n: 4
      },
      {
        id: "hx19",
        color: "H",
        n: 4
      },
      {
        id: "wx3",
        color: "W",
        n: 34
      },
      {
        id: "wx6",
        color: "W",
        n: 16
      },
      {
        id: "wx7",
        color: "W",
        n: 8
      },
      {
        id: "lx33",
        color: "L",
        n: 3
      },
      {
        id: "mx13",
        color: "M",
        n: 4
      },
      {
        id: "mx9",
        color: "M",
        n: 6
      },
      {
        id: "mx10",
        color: "M",
        n: 6
      },
      {
        id: "lx35",
        color: "L",
        n: 6
      },
      {
        id: "mx11",
        color: "M",
        n: 5
      },
      {
        id: "lx32",
        color: "L",
        n: 6
      },
      {
        id: "mx12",
        color: "M",
        n: 4
      },
      {
        id: "hx20",
        color: "H",
        n: 4
      },
      {
        id: "px25",
        color: "P",
        n: 4
      },
      {
        id: "wx8",
        color: "W",
        n: 6
      },
      {
        id: "nx29",
        color: "N",
        n: 136
      },
      {
        id: "cx1",
        color: "C",
        n: 86
      },
      {
        id: "cx2",
        color: "C",
        n: 86
      },
      {
        id: "sx26",
        color: "S",
        n: 209
      },
      {
        id: "sx28",
        color: "S",
        n: 31
      },
      {
        id: "dx30",
        color: "D",
        n: 28
      },
      {
        id: "dx31",
        color: "D",
        n: 28
      },
      {
        id: "bx22",
        color: "B",
        n: 20
      },
      {
        id: "bx23",
        color: "B",
        n: 20
      },
      {
        id: "lx34",
        color: "L",
        n: 6
      },
      {
        id: "hx21",
        color: "H",
        n: 4
      }
    ],
    columns: [
      [
        "px24",
        "hx17",
        "mx14",
        "lx36",
        "sx27",
        "hx15",
        "wx4",
        "hx18",
        "wx5"
      ],
      [
        "hx16",
        "hx19",
        "wx3",
        "wx6",
        "wx7",
        "lx33",
        "mx13",
        "mx9",
        "mx10"
      ],
      [
        "lx35",
        "mx11",
        "lx32",
        "mx12",
        "hx20",
        "px25",
        "wx8",
        "nx29",
        "cx1"
      ],
      [
        "cx2",
        "sx26",
        "sx28",
        "dx30",
        "dx31",
        "bx22",
        "bx23",
        "lx34",
        "hx21"
      ]
    ]
  },
  {
    id: "five-panes",
    no: 4,
    name: "五格萤灯",
    tag: "规划",
    teaches: "五个待令格会被等待的令牌占住。先点能填内芯的小令牌，别把五格一起塞满。",
    mechanic: "五格规划",
    hint: "五盏灯各有一个内芯。先拿小令牌填内芯，再收灯框。",
    map: [
      "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
      "NNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
      "NNNNNNNNNHHNNNNNNNNNNHHNNNNNNN",
      "NNNSSNNNNHHNNNNNNNNNNHHNNNNNNN",
      "NNNSSNNNNNNNNNNNNNNNNNNNNNNSSN",
      "NNNNNNNNNNNNNNNSSNNNNNNNNNNSSN",
      "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
      "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
      "NNNWNNNNNWWWNNNWNNNNWWNNNNNWNN",
      "NNNWNHHNNWWWNNNWNNNNWWNNSSNWNN",
      "NCCCCCHCCCCCNCCCCCNCCCCCSCCCCC",
      "NCCCCCNCWWWCNCMMMCNCHHHCNCBBBC",
      "NCCCCCNCWWWCNCMMMCNCHHHCNCBBBC",
      "NCCPCCNCWPWCNCMPMCNCHPHCNCBPBC",
      "NCCPCCNCWPWCNCMPMCNCHPHCNCBPBC",
      "NCCCCCNCWWWCNCMMMCNCHHHCNCBBBC",
      "NCCCCCNCWWWCDCMMMCNCHHHCDCBBBC",
      "NCCCCCDCCCCCDCCCCCNCCCCCDCCCCC",
      "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
      "DDPPPPDDPPPPDDPPPPDDPPPPDDPPPP",
      "DDPPPPDDPPPPDDPPPPDDPPPPDDPPPP",
      "DPPDDPPPPDDPPPPDDPPPPDDPPPPDDP",
      "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
      "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
      "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
      "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
      "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
      "MMLLMMMMMMMMMLLMMMMMMMMMMLLMMM",
      "MMLLMMMLLMMMMLLMMMMLLMMMMLLMMM",
      "MMMMMMMLLMMMMMMMMMMLLMMMMMMMMM"
    ],
    groups: [
      {
        id: "px17",
        color: "P",
        n: 2
      },
      {
        id: "mx8",
        color: "M",
        n: 16
      },
      {
        id: "cx3",
        color: "C",
        n: 22
      },
      {
        id: "px16",
        color: "P",
        n: 2
      },
      {
        id: "nx29",
        color: "N",
        n: 12
      },
      {
        id: "nx30",
        color: "N",
        n: 16
      },
      {
        id: "wx7",
        color: "W",
        n: 16
      },
      {
        id: "px18",
        color: "P",
        n: 2
      },
      {
        id: "cx2",
        color: "C",
        n: 22
      },
      {
        id: "hx13",
        color: "H",
        n: 16
      },
      {
        id: "cx4",
        color: "C",
        n: 22
      },
      {
        id: "nx33",
        color: "N",
        n: 6
      },
      {
        id: "hx12",
        color: "H",
        n: 3
      },
      {
        id: "nx34",
        color: "N",
        n: 5
      },
      {
        id: "sx23",
        color: "S",
        n: 2
      },
      {
        id: "nx28",
        color: "N",
        n: 8
      },
      {
        id: "sx24",
        color: "S",
        n: 3
      },
      {
        id: "nx31",
        color: "N",
        n: 8
      },
      {
        id: "sx21",
        color: "S",
        n: 4
      },
      {
        id: "px15",
        color: "P",
        n: 2
      },
      {
        id: "hx10",
        color: "H",
        n: 4
      },
      {
        id: "hx11",
        color: "H",
        n: 4
      },
      {
        id: "px19",
        color: "P",
        n: 2
      },
      {
        id: "cx1",
        color: "C",
        n: 38
      },
      {
        id: "bx14",
        color: "B",
        n: 16
      },
      {
        id: "sx22",
        color: "S",
        n: 4
      },
      {
        id: "lx36",
        color: "L",
        n: 4
      },
      {
        id: "lx37",
        color: "L",
        n: 4
      },
      {
        id: "lx38",
        color: "L",
        n: 4
      },
      {
        id: "dx35",
        color: "D",
        n: 126
      },
      {
        id: "px20",
        color: "P",
        n: 59
      },
      {
        id: "wx6",
        color: "W",
        n: 76
      },
      {
        id: "nx26",
        color: "N",
        n: 162
      },
      {
        id: "sx25",
        color: "S",
        n: 30
      },
      {
        id: "mx9",
        color: "M",
        n: 130
      },
      {
        id: "cx5",
        color: "C",
        n: 22
      },
      {
        id: "nx27",
        color: "N",
        n: 14
      },
      {
        id: "nx32",
        color: "N",
        n: 4
      },
      {
        id: "lx39",
        color: "L",
        n: 4
      },
      {
        id: "lx40",
        color: "L",
        n: 4
      }
    ],
    columns: [
      [
        "px17",
        "nx29",
        "cx2",
        "hx12",
        "sx24",
        "hx10",
        "bx14",
        "lx38",
        "nx26",
        "nx27"
      ],
      [
        "mx8",
        "nx30",
        "hx13",
        "nx34",
        "nx31",
        "hx11",
        "sx22",
        "dx35",
        "sx25",
        "nx32"
      ],
      [
        "cx3",
        "wx7",
        "cx4",
        "sx23",
        "sx21",
        "px19",
        "lx36",
        "px20",
        "mx9",
        "lx39"
      ],
      [
        "px16",
        "px18",
        "nx33",
        "nx28",
        "px15",
        "cx1",
        "lx37",
        "wx6",
        "cx5",
        "lx40"
      ]
    ]
  },
  {
    id: "gramophone",
    no: 5,
    name: "橡果留声机",
    tag: "综合",
    teaches: "把窄口、五色令牌和四列队首一起用上，完成最后一件画作。",
    mechanic: "窄口与收尾 8×",
    hint: "喇叭是大块蜜蜡；橡果里还藏着音腔。先看洞穴右侧的原图，再决定先拿哪一列。",
    map: [
      "CCDLLLLLLLLLLCCLLLLLLLLLLLLDDD",
      "CCDLLLLLLLLLLCCLLLLLLLLLLLLDDD",
      "CCWWWWWWWWWWWCCLLLLLLLLLLCCCCD",
      "CCWWWWWWWWWWWCCLLLLLLLLLLCHHCD",
      "CCWWNNNNNNNWWCCLLLLLLLLLLCHHCD",
      "CCWWNBBBNNNWWCCLLLLLLLLLLCCCCD",
      "CCWWNBBBNNNWWCCLLLLLLLLLCCCDDD",
      "CCWWNNNNNHHWWCCLLLLLLLLCCHCDDD",
      "CCWWNNNNNHDDDDDDDDDLLLCCCHCDDD",
      "CCWWNNNNNNDDDDDDDDDLLCCCCHCDDD",
      "CCWWWWWWDDDDDDDDDDDDCCCCCHCDDD",
      "CCWWWWWWDDDDDDDDDDDCCCCCCHCDDD",
      "CCDLLLLLDDDDDDDDDDCCCCCCCCCDDD",
      "CCDLLLLLDDDDDDDDDDCCCCCCCCLLLL",
      "DDDLLLLLLWWWWWWWWWCCCLLLLLLLLL",
      "DDDLLPPLLWHHHWWWWWWWLLLLLLLLLL",
      "DDDLLPPLLWHHHWWWWWWWLLLLLLLLLL",
      "DDDBBLLLWWHHHWWWWWWWWLLLLBBLLL",
      "DDDBBLLLLWHHHWWWWWWWLSSLLBBLLL",
      "DDDLLLLLLWWWWWWWWWWWLSSLLLLLLL",
      "DDDLLLLLLWWWWWWWWSSSSSSLLLLLLL",
      "DDDPPCCCCCWWWWWWWSSSSSSCCLLLLL",
      "DDDPPCCCCCCWWWWWWWCCCCCCCLLLLL",
      "DDDLLCCMDDDDDDWMDDDDDDMCCLLLLL",
      "DDDDDCCMDDDDDDMMDDDDDDMCCDDDDD",
      "DDDDDCCMMMMMMMMMMMMMMMMCCDDDDD",
      "DDDDDCCCCCCCCCCCCCCCCCCCCDDDDD",
      "DDDDDDDDDDDDDDDDDDDDDDDDMMDDDD",
      "DDDDDDDDDDDDDDDDDDDDDDDDMMDDDD",
      "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"
    ],
    groups: [
      {
        id: "hx12",
        color: "H",
        n: 12
      },
      {
        id: "lx30",
        color: "L",
        n: 2
      },
      {
        id: "dx22",
        color: "D",
        n: 61
      },
      {
        id: "sx18",
        color: "S",
        n: 16
      },
      {
        id: "hx10",
        color: "H",
        n: 3
      },
      {
        id: "wx6",
        color: "W",
        n: 77
      },
      {
        id: "dx24",
        color: "D",
        n: 12
      },
      {
        id: "dx25",
        color: "D",
        n: 12
      },
      {
        id: "bx13",
        color: "B",
        n: 6
      },
      {
        id: "px16",
        color: "P",
        n: 4
      },
      {
        id: "nx19",
        color: "N",
        n: 31
      },
      {
        id: "mx7",
        color: "M",
        n: 23
      },
      {
        id: "hx11",
        color: "H",
        n: 5
      },
      {
        id: "cx4",
        color: "C",
        n: 52
      },
      {
        id: "lx28",
        color: "L",
        n: 43
      },
      {
        id: "bx14",
        color: "B",
        n: 4
      },
      {
        id: "bx15",
        color: "B",
        n: 4
      },
      {
        id: "px17",
        color: "P",
        n: 4
      },
      {
        id: "lx31",
        color: "L",
        n: 2
      },
      {
        id: "wx5",
        color: "W",
        n: 54
      },
      {
        id: "hx9",
        color: "H",
        n: 4
      },
      {
        id: "cx3",
        color: "C",
        n: 60
      },
      {
        id: "mx8",
        color: "M",
        n: 4
      },
      {
        id: "lx27",
        color: "L",
        n: 86
      },
      {
        id: "lx29",
        color: "L",
        n: 74
      },
      {
        id: "cx2",
        color: "C",
        n: 16
      },
      {
        id: "dx23",
        color: "D",
        n: 148
      },
      {
        id: "dx21",
        color: "D",
        n: 31
      },
      {
        id: "cx1",
        color: "C",
        n: 28
      },
      {
        id: "lx26",
        color: "L",
        n: 20
      },
      {
        id: "dx20",
        color: "D",
        n: 2
      }
    ],
    columns: [
      [
        "hx12",
        "lx30",
        "dx22",
        "sx18",
        "hx10",
        "wx6",
        "dx24",
        "dx25"
      ],
      [
        "bx13",
        "px16",
        "nx19",
        "mx7",
        "hx11",
        "cx4",
        "lx28",
        "bx14"
      ],
      [
        "bx15",
        "px17",
        "lx31",
        "wx5",
        "hx9",
        "cx3",
        "mx8",
        "lx27"
      ],
      [
        "lx29",
        "cx2",
        "dx23",
        "dx21",
        "cx1",
        "lx26",
        "dx20"
      ]
    ]
  }
];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LEVELS: LEVELS, MATERIALS: MATERIALS };
  } else {
    root.LEVELS = LEVELS;
    root.MATERIALS = MATERIALS;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

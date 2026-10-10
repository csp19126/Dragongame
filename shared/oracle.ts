/**
 * Xin Xăm: the Dragon Oracle. Once an hour a player picks a topic, may type a question
 * (it never leaves their phone), shakes the bamboo cylinder and draws one of 24 fortune
 * sticks. The stick's grade sets a blessing that multiplies the winnings of their next spin.
 * The fortune is entertainment: it cannot see or change what the reels will do.
 */
export type Grade = "dai_cat" | "thuong" | "trung" | "ha";
export type Topic = "luck" | "wealth" | "love" | "career" | "health";

/** Blessing on the next spin's winnings, by grade */
export const GRADE_BLESSING: Record<Grade, number> = { dai_cat: 5, thuong: 3, trung: 2, ha: 1.5 };

export const GRADE_NAME: Record<Grade, { vi: string; en: string; zh: string }> = {
  dai_cat: { vi: "Đại Cát", en: "Great Fortune", zh: "大吉" },
  thuong: { vi: "Thượng Cát", en: "Good Fortune", zh: "上吉" },
  trung: { vi: "Trung Bình", en: "Middle Path", zh: "中平" },
  ha: { vi: "Hạ", en: "Caution", zh: "下籤" },
};

export const TOPICS: { id: Topic; icon: string; vi: string; en: string; zh: string }[] = [
  { id: "luck", icon: "🍀", vi: "Vận may hôm nay", en: "Today's luck", zh: "今日運勢" },
  { id: "wealth", icon: "💰", vi: "Tài lộc", en: "Wealth", zh: "財運" },
  { id: "love", icon: "💞", vi: "Tình duyên", en: "Love", zh: "姻緣" },
  { id: "career", icon: "📜", vi: "Công danh", en: "Work", zh: "事業" },
  { id: "health", icon: "🌿", vi: "Sức khỏe", en: "Health", zh: "健康" },
];

export interface Stick { n: number; grade: Grade; vi: [string, string]; en: [string, string]; zh: [string, string]; meaningVi: string; meaningEn: string; meaningZh: string }

export const STICKS: Stick[] = [
  { n: 1, grade: "dai_cat", vi: ["Rồng vàng cưỡi gió lên mây", "Lộc trời rơi xuống đầy tay người hiền"], en: ["The golden dragon rides the wind to the clouds", "Heaven's fortune falls into kind hands"], zh: ["金龍乘風上青雲", "天降福祿善人門"], meaningVi: "Mọi việc hanh thông, cơ hội lớn đang đến.", meaningEn: "Everything flows; a big chance is coming.", meaningZh: "諸事順利，大好機會即將到來。" },
  { n: 2, grade: "dai_cat", vi: ["Trăng rằm soi sáng đường xa", "Hoa đào nở rộ, phúc nhà sum vầy"], en: ["The full moon lights the long road", "Peach blossom blooms and the family gathers"], zh: ["十五明月照遠途", "桃花盛開閤家歡"], meaningVi: "Niềm vui trọn vẹn, người thân hòa thuận.", meaningEn: "Joy in full, and harmony at home.", meaningZh: "喜事圓滿，家人和睦。" },
  { n: 3, grade: "thuong", vi: ["Thuyền xuôi gặp gió thuận chiều", "Buồm căng một lá, sớm chiều tới nơi"], en: ["The boat finds a following wind", "One full sail, and home by evening"], zh: ["順水行舟遇順風", "滿帆一葉暮歸鄉"], meaningVi: "Việc đang làm sẽ thuận lợi, đừng chần chừ.", meaningEn: "What you're working on will go well; don't hesitate.", meaningZh: "手上的事會很順利，別猶豫。" },
  { n: 4, grade: "thuong", vi: ["Cá chép vượt sóng long môn", "Một phen gắng sức, vẻ vang muôn phần"], en: ["The carp leaps the Dragon Gate", "One great effort, glory a thousandfold"], zh: ["鯉魚奮躍過龍門", "一番苦功萬般榮"], meaningVi: "Cố gắng hôm nay sẽ được đền đáp xứng đáng.", meaningEn: "Today's effort will be well rewarded.", meaningZh: "今天的努力會得到應有的回報。" },
  { n: 5, grade: "thuong", vi: ["Mai vàng hé nụ đầu xuân", "Tin vui gõ cửa, xa gần đều hay"], en: ["Yellow apricot buds in early spring", "Good news knocks, and near and far will hear"], zh: ["早春黃梅初綻蕾", "喜訊臨門遠近聞"], meaningVi: "Sắp có tin vui.", meaningEn: "Good news is on its way.", meaningZh: "好消息就快來了。" },
  { n: 6, grade: "thuong", vi: ["Gieo hạt trên đất phù sa", "Mùa sau lúa trĩu, cả nhà ấm no"], en: ["Seeds sown in rich river soil", "Next season the rice hangs heavy"], zh: ["播種河畔沃土田", "來季稻熟滿倉糧"], meaningVi: "Kiên nhẫn đầu tư sẽ có ngày thu hoạch.", meaningEn: "Patient investment brings a harvest.", meaningZh: "耐心投入，終有收成的一天。" },
  { n: 7, grade: "thuong", vi: ["Chim én liệng giữa trời xanh", "Xuân về mang lộc, an lành bốn phương"], en: ["Swallows wheel in a blue sky", "Spring brings luck and peace on every side"], zh: ["燕子翱翔碧空中", "春來送福四方安"], meaningVi: "Thời vận đang lên, bình an khắp chốn.", meaningEn: "Your luck is rising; peace all round.", meaningZh: "運勢正旺，處處平安。" },
  { n: 8, grade: "thuong", vi: ["Ngọc trong đá vẫn sáng ngời", "Gặp người biết quý, đổi đời từ đây"], en: ["A jewel in the rock still shines", "Meet the one who sees it, and life changes"], zh: ["石中美玉自生輝", "得遇知音運轉來"], meaningVi: "Tài năng của bạn sắp được nhận ra.", meaningEn: "Your talent is about to be noticed.", meaningZh: "你的才華即將被人看見。" },
  { n: 9, grade: "trung", vi: ["Đường dài mới biết ngựa hay", "Chậm mà chắc chắn, có ngày thành công"], en: ["A long road shows the good horse", "Slow and steady, success will come"], zh: ["路遙方知駿馬力", "穩紮穩打終成功"], meaningVi: "Chậm mà chắc, đừng nóng vội.", meaningEn: "Slow and sure; don't rush.", meaningZh: "慢慢來比較快，別心急。" },
  { n: 10, grade: "trung", vi: ["Mây che trăng chỉ một lần", "Gió lên mây tản, ánh vầng lại trong"], en: ["Cloud hides the moon just for a while", "The wind rises and the moon shines clear"], zh: ["浮雲遮月只片刻", "風起雲散月更明"], meaningVi: "Khó khăn nhỏ sẽ qua nhanh.", meaningEn: "A small trouble will soon pass.", meaningZh: "小麻煩很快就會過去。" },
  { n: 11, grade: "trung", vi: ["Nước chảy đá cũng phải mòn", "Kiên trì từng bước, vuông tròn mai sau"], en: ["Running water wears away stone", "Step by patient step, all comes right"], zh: ["滴水長流能穿石", "步步堅持事事成"], meaningVi: "Kiên trì sẽ thành công.", meaningEn: "Persistence wins.", meaningZh: "堅持下去就會成功。" },
  { n: 12, grade: "trung", vi: ["Một cây làm chẳng nên non", "Ba cây chụm lại nên hòn núi cao"], en: ["One tree alone makes no hill", "Three together make a mountain"], zh: ["獨木難以成山林", "三木同心聚成峰"], meaningVi: "Hợp sức cùng người khác sẽ tốt hơn.", meaningEn: "Better together than alone.", meaningZh: "和別人同心協力會更好。" },
  { n: 13, grade: "trung", vi: ["Ăn quả nhớ kẻ trồng cây", "Biết ơn người trước, ngày nay phúc đầy"], en: ["Eating the fruit, remember who planted the tree", "Gratitude fills today with blessings"], zh: ["食果當思種樹人", "感恩前人福滿門"], meaningVi: "Lòng biết ơn mang lại may mắn.", meaningEn: "Gratitude brings good luck.", meaningZh: "懂得感恩會帶來好運。" },
  { n: 14, grade: "trung", vi: ["Sông sâu còn có kẻ dò", "Lòng người khó đoán, hãy lo giữ mình"], en: ["Even deep rivers can be sounded", "Hearts are harder: look after yourself"], zh: ["深河尚可測深淺", "人心難料須自保"], meaningVi: "Cẩn trọng khi tin người.", meaningEn: "Be careful whom you trust.", meaningZh: "信任別人時要多留心。" },
  { n: 15, grade: "trung", vi: ["Trời còn mưa nắng thất thường", "Giữ lòng bình thản, con đường sẽ thông"], en: ["Even the sky turns from rain to sun", "Keep calm and the road will clear"], zh: ["天有晴雨變無常", "心平氣和路自通"], meaningVi: "Bình tĩnh thì mọi chuyện sẽ ổn.", meaningEn: "Stay calm and it will be fine.", meaningZh: "保持冷靜，一切都會好的。" },
  { n: 16, grade: "trung", vi: ["Tre già thì măng mọc lên", "Việc cũ khép lại, cửa bên mở ra"], en: ["Old bamboo gives way to new shoots", "One door closes and another opens"], zh: ["老竹退讓新筍生", "此門關閉彼門開"], meaningVi: "Kết thúc một việc là mở ra việc mới.", meaningEn: "An ending makes room for a beginning.", meaningZh: "一件事結束，就是新事的開始。" },
  { n: 17, grade: "trung", vi: ["Mài sắt chẳng ngại tháng ngày", "Có công rồi sẽ có ngày nên kim"], en: ["Grinding iron, never minding the days", "With effort it becomes a needle"], zh: ["磨鐵不嫌歲月長", "功夫深處鐵成針"], meaningVi: "Có công mài sắt, có ngày nên kim.", meaningEn: "Effort turns iron into a needle.", meaningZh: "只要功夫深，鐵杵磨成針。" },
  { n: 18, grade: "trung", vi: ["Thuận buồm chưa chắc xuôi dòng", "Nghỉ ngơi đôi chút, thong dong lại về"], en: ["A fair wind is not always a smooth river", "Rest a little and ease returns"], zh: ["順風未必水流平", "稍作歇息自從容"], meaningVi: "Đừng vội, nghỉ một chút sẽ tốt hơn.", meaningEn: "Don't hurry; a short rest will help.", meaningZh: "別急，休息一下會更好。" },
  { n: 19, grade: "ha", vi: ["Trời chiều mây xám giăng ngang", "Hãy về trú tạm, chớ màng đường xa"], en: ["Grey cloud spreads across the evening sky", "Take shelter now; the long road can wait"], zh: ["黃昏灰雲橫天際", "暫且歸家莫遠行"], meaningVi: "Hôm nay nên thận trọng, chơi nhỏ thôi.", meaningEn: "Be careful today; keep it small.", meaningZh: "今天要謹慎，小玩就好。" },
  { n: 20, grade: "ha", vi: ["Lá vàng rơi giữa sân thu", "Buông điều đã cũ, chờ xuân sang mùa"], en: ["Yellow leaves fall in the autumn yard", "Let the old go and wait for spring"], zh: ["秋庭黃葉片片落", "放下舊事待春來"], meaningVi: "Buông bỏ chuyện cũ để đón điều mới.", meaningEn: "Let go of the past to welcome the new.", meaningZh: "放下過去，迎接新的開始。" },
  { n: 21, grade: "ha", vi: ["Đò ngang gặp sóng giữa dòng", "Bình tâm giữ lái, qua sông an toàn"], en: ["The ferry meets waves mid-river", "Steady at the helm, you'll cross safely"], zh: ["渡船江心遇風浪", "定心穩舵渡平安"], meaningVi: "Gặp sóng gió, giữ bình tĩnh là qua.", meaningEn: "Rough water: stay steady and you'll cross.", meaningZh: "遇到風浪，保持冷靜就能度過。" },
  { n: 22, grade: "ha", vi: ["Đêm dài rồi cũng đến mai", "Đừng buồn chuyện nhỏ, ngày mai sẽ cười"], en: ["Even the longest night reaches morning", "Don't fret small things; tomorrow you'll smile"], zh: ["長夜終有天明時", "莫愁小事明日笑"], meaningVi: "Chuyện buồn rồi sẽ qua.", meaningEn: "Sad things pass.", meaningZh: "傷心事總會過去的。" },
  { n: 23, grade: "ha", vi: ["Gió đông thổi lạnh căn nhà", "Thắp lò sưởi ấm, người nhà gần nhau"], en: ["The east wind chills the house", "Light the stove and stay close to family"], zh: ["東風吹來屋生寒", "燃爐取暖伴家人"], meaningVi: "Dành thời gian cho người thân.", meaningEn: "Spend time with your family.", meaningZh: "多花點時間陪陪家人。" },
  { n: 24, grade: "ha", vi: ["Hoa kia nở có lúc tàn", "Biết dừng đúng lúc mới là người khôn"], en: ["Every flower that blooms will fade", "The wise know when to stop"], zh: ["花開總有凋零日", "知止方為智者心"], meaningVi: "Biết điểm dừng: hôm nay nên nghỉ sớm.", meaningEn: "Know when to stop: call it a night early.", meaningZh: "懂得適可而止：今天早點休息吧。" },
];

/** Advice for each topic, by grade */
export const ADVICE: Record<Topic, Record<Grade, { vi: string; en: string; zh: string }>> = {
  luck: {
    dai_cat: { vi: "Hôm nay là ngày của bạn!", en: "Today is your day!", zh: "今天就是你的好日子！" },
    thuong: { vi: "Vận may đang lên.", en: "Your luck is rising.", zh: "好運正在上升。" },
    trung: { vi: "Bình thường: chơi vui là chính.", en: "An ordinary day: play for fun.", zh: "平常的一天：玩得開心最重要。" },
    ha: { vi: "Nên chơi nhỏ và nghỉ sớm.", en: "Bet small and stop early.", zh: "小注就好，早點收手。" },
  },
  wealth: {
    dai_cat: { vi: "Tài lộc dồi dào, nhớ chia sẻ cho người thân.", en: "Plenty coming in; share it with the people you love.", zh: "財源滾滾，記得與家人分享。" },
    thuong: { vi: "Lộc đến từ sự chăm chỉ.", en: "Hard work brings the money.", zh: "勤奮帶來財富。" },
    trung: { vi: "Thu chi cân bằng, đừng tiêu quá tay.", en: "Balance the books; don't overspend.", zh: "收支平衡，別花過頭。" },
    ha: { vi: "Giữ chặt túi tiền hôm nay.", en: "Keep a tight hold on your purse today.", zh: "今天要看緊荷包。" },
  },
  love: {
    dai_cat: { vi: "Duyên lành đã tới, hãy mở lòng.", en: "The right person is near; open your heart.", zh: "良緣已到，敞開心扉吧。" },
    thuong: { vi: "Tình cảm thêm gắn bó.", en: "Love grows closer.", zh: "感情更加親密。" },
    trung: { vi: "Kiên nhẫn, tình cảm cần thời gian.", en: "Be patient; love takes time.", zh: "耐心點，感情需要時間。" },
    ha: { vi: "Lắng nghe nhiều hơn nói.", en: "Listen more than you speak.", zh: "多聽少說。" },
  },
  career: {
    dai_cat: { vi: "Thời cơ chín muồi, hãy mạnh dạn.", en: "The time is ripe; be bold.", zh: "時機成熟，放膽去做。" },
    thuong: { vi: "Có quý nhân giúp đỡ.", en: "Someone important will help you.", zh: "會有貴人相助。" },
    trung: { vi: "Làm từng bước, chắc chắn.", en: "One sure step at a time.", zh: "一步一腳印，穩穩前進。" },
    ha: { vi: "Tránh quyết định vội vàng.", en: "Avoid hasty decisions.", zh: "避免倉促做決定。" },
  },
  health: {
    dai_cat: { vi: "Sức khỏe sung mãn, tinh thần phơi phới.", en: "Strong body, bright spirits.", zh: "身強體健，精神飽滿。" },
    thuong: { vi: "Khỏe mạnh, nhớ ngủ đủ giấc.", en: "Healthy; remember to sleep well.", zh: "身體健康，記得睡飽。" },
    trung: { vi: "Uống nhiều nước, đi bộ nhiều hơn.", en: "Drink more water and walk more.", zh: "多喝水，多走路。" },
    ha: { vi: "Nghỉ ngơi, đừng thức khuya.", en: "Rest, and don't stay up late.", zh: "好好休息，別熬夜。" },
  },
};

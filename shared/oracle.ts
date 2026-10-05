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

export const GRADE_NAME: Record<Grade, { vi: string; en: string }> = {
  dai_cat: { vi: "Đại Cát", en: "Great Fortune" },
  thuong: { vi: "Thượng Cát", en: "Good Fortune" },
  trung: { vi: "Trung Bình", en: "Middle Path" },
  ha: { vi: "Hạ", en: "Caution" },
};

export const TOPICS: { id: Topic; icon: string; vi: string; en: string }[] = [
  { id: "luck", icon: "🍀", vi: "Vận may hôm nay", en: "Today's luck" },
  { id: "wealth", icon: "💰", vi: "Tài lộc", en: "Wealth" },
  { id: "love", icon: "💞", vi: "Tình duyên", en: "Love" },
  { id: "career", icon: "📜", vi: "Công danh", en: "Work" },
  { id: "health", icon: "🌿", vi: "Sức khỏe", en: "Health" },
];

export interface Stick { n: number; grade: Grade; vi: [string, string]; en: [string, string]; meaningVi: string; meaningEn: string }

export const STICKS: Stick[] = [
  { n: 1, grade: "dai_cat", vi: ["Rồng vàng cưỡi gió lên mây", "Lộc trời rơi xuống đầy tay người hiền"], en: ["The golden dragon rides the wind to the clouds", "Heaven's fortune falls into kind hands"], meaningVi: "Mọi việc hanh thông, cơ hội lớn đang đến.", meaningEn: "Everything flows; a big chance is coming." },
  { n: 2, grade: "dai_cat", vi: ["Trăng rằm soi sáng đường xa", "Hoa đào nở rộ, phúc nhà sum vầy"], en: ["The full moon lights the long road", "Peach blossom blooms and the family gathers"], meaningVi: "Niềm vui trọn vẹn, người thân hòa thuận.", meaningEn: "Joy in full, and harmony at home." },
  { n: 3, grade: "thuong", vi: ["Thuyền xuôi gặp gió thuận chiều", "Buồm căng một lá, sớm chiều tới nơi"], en: ["The boat finds a following wind", "One full sail, and home by evening"], meaningVi: "Việc đang làm sẽ thuận lợi, đừng chần chừ.", meaningEn: "What you're working on will go well; don't hesitate." },
  { n: 4, grade: "thuong", vi: ["Cá chép vượt sóng long môn", "Một phen gắng sức, vẻ vang muôn phần"], en: ["The carp leaps the Dragon Gate", "One great effort, glory a thousandfold"], meaningVi: "Cố gắng hôm nay sẽ được đền đáp xứng đáng.", meaningEn: "Today's effort will be well rewarded." },
  { n: 5, grade: "thuong", vi: ["Mai vàng hé nụ đầu xuân", "Tin vui gõ cửa, xa gần đều hay"], en: ["Yellow apricot buds in early spring", "Good news knocks, and near and far will hear"], meaningVi: "Sắp có tin vui.", meaningEn: "Good news is on its way." },
  { n: 6, grade: "thuong", vi: ["Gieo hạt trên đất phù sa", "Mùa sau lúa trĩu, cả nhà ấm no"], en: ["Seeds sown in rich river soil", "Next season the rice hangs heavy"], meaningVi: "Kiên nhẫn đầu tư sẽ có ngày thu hoạch.", meaningEn: "Patient investment brings a harvest." },
  { n: 7, grade: "thuong", vi: ["Chim én liệng giữa trời xanh", "Xuân về mang lộc, an lành bốn phương"], en: ["Swallows wheel in a blue sky", "Spring brings luck and peace on every side"], meaningVi: "Thời vận đang lên, bình an khắp chốn.", meaningEn: "Your luck is rising; peace all round." },
  { n: 8, grade: "thuong", vi: ["Ngọc trong đá vẫn sáng ngời", "Gặp người biết quý, đổi đời từ đây"], en: ["A jewel in the rock still shines", "Meet the one who sees it, and life changes"], meaningVi: "Tài năng của bạn sắp được nhận ra.", meaningEn: "Your talent is about to be noticed." },
  { n: 9, grade: "trung", vi: ["Đường dài mới biết ngựa hay", "Chậm mà chắc chắn, có ngày thành công"], en: ["A long road shows the good horse", "Slow and steady, success will come"], meaningVi: "Chậm mà chắc, đừng nóng vội.", meaningEn: "Slow and sure; don't rush." },
  { n: 10, grade: "trung", vi: ["Mây che trăng chỉ một lần", "Gió lên mây tản, ánh vầng lại trong"], en: ["Cloud hides the moon just for a while", "The wind rises and the moon shines clear"], meaningVi: "Khó khăn nhỏ sẽ qua nhanh.", meaningEn: "A small trouble will soon pass." },
  { n: 11, grade: "trung", vi: ["Nước chảy đá cũng phải mòn", "Kiên trì từng bước, vuông tròn mai sau"], en: ["Running water wears away stone", "Step by patient step, all comes right"], meaningVi: "Kiên trì sẽ thành công.", meaningEn: "Persistence wins." },
  { n: 12, grade: "trung", vi: ["Một cây làm chẳng nên non", "Ba cây chụm lại nên hòn núi cao"], en: ["One tree alone makes no hill", "Three together make a mountain"], meaningVi: "Hợp sức cùng người khác sẽ tốt hơn.", meaningEn: "Better together than alone." },
  { n: 13, grade: "trung", vi: ["Ăn quả nhớ kẻ trồng cây", "Biết ơn người trước, ngày nay phúc đầy"], en: ["Eating the fruit, remember who planted the tree", "Gratitude fills today with blessings"], meaningVi: "Lòng biết ơn mang lại may mắn.", meaningEn: "Gratitude brings good luck." },
  { n: 14, grade: "trung", vi: ["Sông sâu còn có kẻ dò", "Lòng người khó đoán, hãy lo giữ mình"], en: ["Even deep rivers can be sounded", "Hearts are harder: look after yourself"], meaningVi: "Cẩn trọng khi tin người.", meaningEn: "Be careful whom you trust." },
  { n: 15, grade: "trung", vi: ["Trời còn mưa nắng thất thường", "Giữ lòng bình thản, con đường sẽ thông"], en: ["Even the sky turns from rain to sun", "Keep calm and the road will clear"], meaningVi: "Bình tĩnh thì mọi chuyện sẽ ổn.", meaningEn: "Stay calm and it will be fine." },
  { n: 16, grade: "trung", vi: ["Tre già thì măng mọc lên", "Việc cũ khép lại, cửa bên mở ra"], en: ["Old bamboo gives way to new shoots", "One door closes and another opens"], meaningVi: "Kết thúc một việc là mở ra việc mới.", meaningEn: "An ending makes room for a beginning." },
  { n: 17, grade: "trung", vi: ["Mài sắt chẳng ngại tháng ngày", "Có công rồi sẽ có ngày nên kim"], en: ["Grinding iron, never minding the days", "With effort it becomes a needle"], meaningVi: "Có công mài sắt, có ngày nên kim.", meaningEn: "Effort turns iron into a needle." },
  { n: 18, grade: "trung", vi: ["Thuận buồm chưa chắc xuôi dòng", "Nghỉ ngơi đôi chút, thong dong lại về"], en: ["A fair wind is not always a smooth river", "Rest a little and ease returns"], meaningVi: "Đừng vội, nghỉ một chút sẽ tốt hơn.", meaningEn: "Don't hurry; a short rest will help." },
  { n: 19, grade: "ha", vi: ["Trời chiều mây xám giăng ngang", "Hãy về trú tạm, chớ màng đường xa"], en: ["Grey cloud spreads across the evening sky", "Take shelter now; the long road can wait"], meaningVi: "Hôm nay nên thận trọng, chơi nhỏ thôi.", meaningEn: "Be careful today; keep it small." },
  { n: 20, grade: "ha", vi: ["Lá vàng rơi giữa sân thu", "Buông điều đã cũ, chờ xuân sang mùa"], en: ["Yellow leaves fall in the autumn yard", "Let the old go and wait for spring"], meaningVi: "Buông bỏ chuyện cũ để đón điều mới.", meaningEn: "Let go of the past to welcome the new." },
  { n: 21, grade: "ha", vi: ["Đò ngang gặp sóng giữa dòng", "Bình tâm giữ lái, qua sông an toàn"], en: ["The ferry meets waves mid-river", "Steady at the helm, you'll cross safely"], meaningVi: "Gặp sóng gió, giữ bình tĩnh là qua.", meaningEn: "Rough water: stay steady and you'll cross." },
  { n: 22, grade: "ha", vi: ["Đêm dài rồi cũng đến mai", "Đừng buồn chuyện nhỏ, ngày mai sẽ cười"], en: ["Even the longest night reaches morning", "Don't fret small things; tomorrow you'll smile"], meaningVi: "Chuyện buồn rồi sẽ qua.", meaningEn: "Sad things pass." },
  { n: 23, grade: "ha", vi: ["Gió đông thổi lạnh căn nhà", "Thắp lò sưởi ấm, người nhà gần nhau"], en: ["The east wind chills the house", "Light the stove and stay close to family"], meaningVi: "Dành thời gian cho người thân.", meaningEn: "Spend time with your family." },
  { n: 24, grade: "ha", vi: ["Hoa kia nở có lúc tàn", "Biết dừng đúng lúc mới là người khôn"], en: ["Every flower that blooms will fade", "The wise know when to stop"], meaningVi: "Biết điểm dừng: hôm nay nên nghỉ sớm.", meaningEn: "Know when to stop: call it a night early." },
];

/** Advice for each topic, by grade */
export const ADVICE: Record<Topic, Record<Grade, { vi: string; en: string }>> = {
  luck: {
    dai_cat: { vi: "Hôm nay là ngày của bạn!", en: "Today is your day!" },
    thuong: { vi: "Vận may đang lên.", en: "Your luck is rising." },
    trung: { vi: "Bình thường: chơi vui là chính.", en: "An ordinary day: play for fun." },
    ha: { vi: "Nên chơi nhỏ và nghỉ sớm.", en: "Bet small and stop early." },
  },
  wealth: {
    dai_cat: { vi: "Tài lộc dồi dào, nhớ chia sẻ cho người thân.", en: "Plenty coming in; share it with the people you love." },
    thuong: { vi: "Lộc đến từ sự chăm chỉ.", en: "Hard work brings the money." },
    trung: { vi: "Thu chi cân bằng, đừng tiêu quá tay.", en: "Balance the books; don't overspend." },
    ha: { vi: "Giữ chặt túi tiền hôm nay.", en: "Keep a tight hold on your purse today." },
  },
  love: {
    dai_cat: { vi: "Duyên lành đã tới, hãy mở lòng.", en: "The right person is near; open your heart." },
    thuong: { vi: "Tình cảm thêm gắn bó.", en: "Love grows closer." },
    trung: { vi: "Kiên nhẫn, tình cảm cần thời gian.", en: "Be patient; love takes time." },
    ha: { vi: "Lắng nghe nhiều hơn nói.", en: "Listen more than you speak." },
  },
  career: {
    dai_cat: { vi: "Thời cơ chín muồi, hãy mạnh dạn.", en: "The time is ripe; be bold." },
    thuong: { vi: "Có quý nhân giúp đỡ.", en: "Someone important will help you." },
    trung: { vi: "Làm từng bước, chắc chắn.", en: "One sure step at a time." },
    ha: { vi: "Tránh quyết định vội vàng.", en: "Avoid hasty decisions." },
  },
  health: {
    dai_cat: { vi: "Sức khỏe sung mãn, tinh thần phơi phới.", en: "Strong body, bright spirits." },
    thuong: { vi: "Khỏe mạnh, nhớ ngủ đủ giấc.", en: "Healthy; remember to sleep well." },
    trung: { vi: "Uống nhiều nước, đi bộ nhiều hơn.", en: "Drink more water and walk more." },
    ha: { vi: "Nghỉ ngơi, đừng thức khuya.", en: "Rest, and don't stay up late." },
  },
};

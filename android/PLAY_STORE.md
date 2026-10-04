# Putting VnSlot 888 on Google Play

Everything technical is done. What's left needs **you**, because it's your
Google account, your ID and your money.

## What you've been sent

| File | What it's for |
|---|---|
| `vnslot888-1.0.0.aab` | **The app.** This is what you upload to Google Play. |
| `vnslot888-1.0.0-test.apk` | A copy to install on your own phone and try before Google has it. |
| `vnslot888-upload-key.jks` + `upload-key-password.txt` | **Your signing key.** Keep both somewhere safe and private (a password manager, or a private Google Drive folder). Never post them anywhere. You need them for every future update. If you lose them, Google can reset the key, but it's a hassle. |
| `feature-graphic.png` (1024×500), `screenshot-*.png` (1080×1920), `icon-512.png` | Store listing images. |

## Step 1: Try it on your phone (5 minutes, optional)

1. Send `vnslot888-1.0.0-test.apk` to your Pixel (email it to yourself, or Google Drive).
2. Tap it. Android will ask to allow installing from that app ("Install unknown apps"): allow it.
3. Open **VnSlot 888** from your home screen. Once Claude has added your key to the website, it opens full-screen with no browser bar.

## Step 2: Make a Google Play developer account

1. Go to https://play.google.com/console/signup and sign in with your Google account.
2. Choose **Personal** (for yourself).
3. Pay the **US$25 one-off fee**.
4. Verify your identity. Google asks for photo ID and checks your name and address, which can take a few days.
5. Give a **developer email** that's shown publicly. Suggestion: `support@vnslot888.online` (see Step 7 to make it forward to your Gmail).

**Important rule for new personal accounts:** before your app can go public,
Google makes you run a **closed test with at least 12 testers for 14 days in a row**.
Rope in friends and family with Android phones: they join via a link and just need to keep it
installed and open it now and then. After the 14 days you apply for "production access".

## Step 3: Create the app

Play Console → **Create app**:

- App name: `VnSlot 888 – Slot & Bầu Cua`
- Default language: **Vietnamese – vi** (add English later under Store listing → Translations)
- App or game: **Game**
- Free or paid: **Free**
- Tick the declarations (Developer Program Policies, US export laws).

## Step 4: Upload the app (closed testing)

1. **Testing → Closed testing → Create track** (or use "Alpha") → **Create new release**.
2. When asked about app signing, choose **Use Google-generated key** (the recommended default).
3. Upload `vnslot888-1.0.0.aab`.
4. Release name: `1.0.0`. Release notes: `Phiên bản đầu tiên: Slot Rồng, Bầu Cua Tôm Cá và Roulette.`
5. Add your testers (a Google Group or a list of their Gmail addresses), then save and roll out.

**Then send Claude the app signing fingerprint:** Play Console → **Test and release → Setup → App
signing (App integrity)** → copy the **SHA-256 certificate fingerprint** under "App signing key
certificate". Claude adds it to the website so the Play version opens full-screen. Until
that's done, the Play version shows a thin browser bar at the top.

## Step 5: Fill in "App content" (Policy → App content)

| Section | Answer |
|---|---|
| Privacy policy | `https://vnslot888.online/privacy` |
| Ads | **No**, the app has no ads |
| App access | All features need an account: give Google a test login (make a spare account, e.g. username `googlereview`, and give its password) |
| Content rating | Fill in the questionnaire honestly. Category **Game**; answer **Yes** to **simulated gambling**. Expect an adult rating. |
| Target audience | **18 and over only** |
| News app | No |
| Data safety | See below |
| Government app | No |
| Financial features | None |
| Account deletion | Yes, users can delete accounts in the app. Web link: `https://vnslot888.online/delete-account` |

**Data safety answers** (what the app really does):
- Does your app collect or share user data? **Yes, collects** (it doesn't share).
- Encrypted in transit: **Yes**. Users can request deletion: **Yes**.
- Data types:
  - **Personal info → User IDs**: the username. Collected, not shared, required, used for *App functionality* and *Account management*.
  - **App activity → App interactions**: game statistics and coin balance. Collected, not shared, required, used for *App functionality*.
- Nothing else: no location, contacts, photos, email, phone number, ads ID or analytics.

## Step 6: Store listing (Grow → Store presence → Main store listing)

- App icon: `icon-512.png`
- Feature graphic: `feature-graphic.png`
- Phone screenshots: the three `screenshot-*.png`
- Category: **Games → Casino**
- Contact email: your developer email; Website: `https://vnslot888.online`

**Short description (Vietnamese):**
```
Slot Rồng, Bầu Cua Tôm Cá và Roulette. Miễn phí, chỉ dùng xu ảo, 18+.
```

**Full description (Vietnamese):**
```
VnSlot 888 – Long Phát Tài: ba trò chơi phong cách Việt, chung một ví xu.

🐉 SLOT RỒNG: 9 hàng thưởng, Ngọc Rồng (Wild), Lì Xì mở vòng quay miễn phí, Rồng Lặp nhân thưởng tới ×12 và hũ Hũ Rồng tích luỹ.
🦀 BẦU CUA TÔM CÁ: trò chơi ngày Tết quen thuộc. Đặt cược Bầu, Cua, Tôm, Cá, Gà, Nai rồi lắc ba xúc xắc.
🎡 ROULETTE: bàn châu Âu một số 0, cược số, tá, cột, đỏ/đen, chẵn/lẻ.

✨ Hoàn toàn miễn phí: nhận 50.000 xu khi đăng ký và thêm xu miễn phí mỗi ngày.
🎲 Công bằng: mọi kết quả do máy chủ chọn ngẫu nhiên, tỷ lệ hoàn trả được công bố trong từng trò chơi.
🏆 Thành tích, bảng xếp hạng và hiệu ứng pháo hoa khi thắng lớn.

QUAN TRỌNG: Xu chỉ dùng để giải trí. Không thể mua xu bằng tiền thật, không thể đổi xu ra tiền hay quà, và không có giải thưởng thật. Trò chơi dành cho người từ 18 tuổi. Chơi giỏi ở trò chơi mô phỏng không có nghĩa là sẽ thắng ở cờ bạc thật.
```

**Short description (English):**
```
Dragon slot, Bầu Cua dice and roulette. Free, play coins only, 18+.
```

**Full description (English):**
```
VnSlot 888 – Dragon Fortune: three Vietnamese-style games on one coin balance.

🐉 DRAGON SLOT: 9 paylines, Dragon Pearl wilds, red-envelope free spins, the Repeater with multipliers up to ×12, and the Hũ Rồng progressive jackpot.
🦀 BẦU CUA TÔM CÁ: the Tết dice game. Bet on the gourd, crab, shrimp, fish, rooster or deer and roll three dice.
🎡 ROULETTE: European single zero. Numbers, dozens, columns, red/black, odd/even.

✨ Completely free: 50,000 coins when you sign up, plus free coins every day.
🎲 Fair: every result is drawn on the server, and each game publishes its return to player.
🏆 Achievements, leaderboard and fireworks for big wins.

IMPORTANT: Coins are for entertainment only. They can't be bought with real money, can't be exchanged for money or prizes, and there are no real prizes. For adults 18+. Success at simulated gambling does not mean future success at real-money gambling.
```

## Step 7: Make support@vnslot888.online reach your Gmail (Namecheap, free)

1. Namecheap → Domain List → **Manage** next to vnslot888.online → **Advanced DNS**.
2. Scroll to **Mail Settings** and choose **Email Forwarding** (leave your other records alone).
3. Go to the **Domain** tab → **Redirect Email** → **Add forwarder**: alias `support`, forward to your Gmail.

## Step 8: Countries

Under **Production → Countries/regions**, choose where it's available. Google may
restrict simulated-gambling apps in some countries, and **Vietnam requires
licences for online games**, so Vietnam may not be available or may need
a licence. Check before you rely on Play for Vietnamese players. The website and its
"Install app" button work everywhere, Vietnam included, with no store needed.

## Future updates

Website changes (new games, fixes) reach the app **instantly**; no new upload needed.
Only changes to the app shell itself (icon, name, Android version) need a new `.aab`.
See `README.md` in this folder.

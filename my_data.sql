--
-- PostgreSQL database dump
--

\restrict UuunlzTX733tnzblk9WJTR9edxAV0dA034gFhXAnlbmi4meK125xGJQeKyvs3bx

-- Dumped from database version 18.3 (Debian 18.3-1+b1)
-- Dumped by pg_dump version 18.3 (Debian 18.3-1+b1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: achievements; Type: TABLE DATA; Schema: public; Owner: dragonadmin
--

INSERT INTO public.achievements VALUES (1, '55109529', 'high_roller', 'High Roller', 'Bet 100,000 or more!', 'gem', '2026-03-22 15:36:13.873057');
INSERT INTO public.achievements VALUES (2, '55109529', 'millionaire', 'Millionaire', 'Balance reached 1,000,000!', 'crown', '2026-03-22 15:36:13.878539');
INSERT INTO public.achievements VALUES (3, '55109529', 'first_win', 'First Win', 'Won your first spin!', 'trophy', '2026-03-22 15:36:13.882797');
INSERT INTO public.achievements VALUES (4, '55109529', 'hot_streak_3', 'Hot Streak x3', '3 consecutive wins!', 'flame', '2026-03-22 15:36:13.886706');
INSERT INTO public.achievements VALUES (5, '55109529', 'lucky_seven', 'Lucky Seven', 'Won 7 times!', 'clover', '2026-03-22 15:36:13.891176');
INSERT INTO public.achievements VALUES (6, '55109529', 'jackpot_hunter', 'Jackpot Hunter', 'Hit a jackpot!', 'star', '2026-03-22 15:36:13.896672');
INSERT INTO public.achievements VALUES (7, '55109529', 'dragon_master', 'Dragon Master', 'Win with 3 dragons!', 'dragon', '2026-03-22 15:36:13.902071');
INSERT INTO public.achievements VALUES (8, 'susu', 'millionaire', 'Millionaire', 'Balance reached 1,000,000!', 'crown', '2026-03-27 12:19:47.095726');
INSERT INTO public.achievements VALUES (9, 'susu', 'first_win', 'First Win', 'Won your first spin!', 'trophy', '2026-03-27 12:19:50.271964');
INSERT INTO public.achievements VALUES (10, 'susu', 'high_roller', 'High Roller', 'Bet 100,000 or more!', 'gem', '2026-03-27 12:19:55.483248');
INSERT INTO public.achievements VALUES (11, 'susu', 'dragon_master', 'Dragon Master', 'Win with 3 dragons!', 'dragon', '2026-03-27 12:20:19.24607');
INSERT INTO public.achievements VALUES (12, 'susu', 'lucky_seven', 'Lucky Seven', 'Won 7 times!', 'clover', '2026-03-27 12:20:49.148746');
INSERT INTO public.achievements VALUES (13, 'susu', 'jackpot_hunter', 'Jackpot Hunter', 'Hit a jackpot!', 'star', '2026-03-27 12:38:12.923527');
INSERT INTO public.achievements VALUES (14, 'd9a101cc-a823-4846-ac60-3df15af92376', 'high_roller', 'High Roller', 'Bet 100,000 or more!', 'gem', '2026-03-27 12:46:45.846557');
INSERT INTO public.achievements VALUES (15, 'd9a101cc-a823-4846-ac60-3df15af92376', 'millionaire', 'Millionaire', 'Balance reached 1,000,000!', 'crown', '2026-03-27 12:46:45.8496');
INSERT INTO public.achievements VALUES (16, 'd9a101cc-a823-4846-ac60-3df15af92376', 'first_win', 'First Win', 'Won your first spin!', 'trophy', '2026-03-27 12:47:05.868241');
INSERT INTO public.achievements VALUES (17, 'd9a101cc-a823-4846-ac60-3df15af92376', 'hot_streak_3', 'Hot Streak x3', '3 consecutive wins!', 'flame', '2026-03-27 12:47:10.322847');
INSERT INTO public.achievements VALUES (18, 'd9a101cc-a823-4846-ac60-3df15af92376', 'hot_streak_5', 'Hot Streak x5', '5 consecutive wins!', 'zap', '2026-03-27 12:47:35.747329');
INSERT INTO public.achievements VALUES (19, 'd9a101cc-a823-4846-ac60-3df15af92376', 'lucky_seven', 'Lucky Seven', 'Won 7 times!', 'clover', '2026-03-27 12:51:55.271357');
INSERT INTO public.achievements VALUES (20, 'susu', 'hot_streak_3', 'Hot Streak x3', '3 consecutive wins!', 'flame', '2026-03-27 12:55:23.235119');
INSERT INTO public.achievements VALUES (21, 'susu', 'hot_streak_5', 'Hot Streak x5', '5 consecutive wins!', 'zap', '2026-03-27 13:24:06.611383');
INSERT INTO public.achievements VALUES (22, 'd9a101cc-a823-4846-ac60-3df15af92376', 'dragon_master', 'Dragon Master', 'Win with 3 dragons!', 'dragon', '2026-03-28 00:21:17.416757');
INSERT INTO public.achievements VALUES (23, '55109529', 'hot_streak_5', 'Hot Streak x5', '5 consecutive wins!', 'zap', '2026-03-28 00:23:29.09938');
INSERT INTO public.achievements VALUES (24, 'd9a101cc-a823-4846-ac60-3df15af92376', 'jackpot_hunter', 'Jackpot Hunter', 'Hit a jackpot!', 'star', '2026-03-28 00:36:03.034297');


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: dragonadmin
--



--
-- Data for Name: deposits; Type: TABLE DATA; Schema: public; Owner: dragonadmin
--

INSERT INTO public.deposits VALUES (1, 'd9a101cc-a823-4846-ac60-3df15af92376', 100000000, 'gift_card', 'CHRIS-VIP', 'completed', '2026-03-27 12:45:35.710833');
INSERT INTO public.deposits VALUES (2, 'ef851736-fe6b-4eff-867a-68915e9c1683', 100000000, 'gift_card', 'HIEU-VIP', 'completed', '2026-03-27 12:55:11.765412');
INSERT INTO public.deposits VALUES (3, '55109529', 800000000, 'gift_card', 'CHRIS2', 'completed', '2026-03-28 00:50:46.516722');


--
-- Data for Name: game_states; Type: TABLE DATA; Schema: public; Owner: dragonadmin
--

INSERT INTO public.game_states VALUES (3, 'susu', 'main', NULL, 0, 0, '2026-03-27 12:19:47.068227');
INSERT INTO public.game_states VALUES (4, 'd9a101cc-a823-4846-ac60-3df15af92376', 'main', NULL, 0, 0, '2026-03-27 12:46:45.832809');
INSERT INTO public.game_states VALUES (1, '55109529', 'main', NULL, 0, 0, '2026-03-27 12:13:10.234057');


--
-- Data for Name: gift_cards; Type: TABLE DATA; Schema: public; Owner: dragonadmin
--

INSERT INTO public.gift_cards VALUES (1, 'DRAGON-50K-2024', 50000, false, NULL, '2026-03-22 15:21:27.593557', NULL);
INSERT INTO public.gift_cards VALUES (2, 'FORTUNE-100K-888', 100000, false, NULL, '2026-03-22 15:21:27.616187', NULL);
INSERT INTO public.gift_cards VALUES (3, 'LUCKY-500K-VIP', 500000, false, NULL, '2026-03-22 15:21:27.622452', NULL);
INSERT INTO public.gift_cards VALUES (4, 'PHOENIX-1M-GOLD', 1000000, false, NULL, '2026-03-22 15:21:27.627481', NULL);
INSERT INTO public.gift_cards VALUES (5, 'EMPEROR-5M-PLAT', 5000000, false, NULL, '2026-03-22 15:21:27.63345', NULL);
INSERT INTO public.gift_cards VALUES (6, 'DRAGON-10M-ULTRA', 10000000, false, NULL, '2026-03-22 15:21:27.63757', NULL);
INSERT INTO public.gift_cards VALUES (7, 'WELCOME-50K-NEW', 50000, false, NULL, '2026-03-22 15:21:27.641075', NULL);
INSERT INTO public.gift_cards VALUES (8, 'VIP-100K-2024', 100000, false, NULL, '2026-03-22 15:21:27.64474', NULL);
INSERT INTO public.gift_cards VALUES (9, 'SUSU-10M-VIP', 10000000, false, NULL, '2026-03-22 15:21:27.649254', NULL);
INSERT INTO public.gift_cards VALUES (10, 'SUSU-85M-DRAGON', 85000000, false, NULL, '2026-03-22 15:21:27.653083', NULL);
INSERT INTO public.gift_cards VALUES (11, 'CHRIS-VIP', 100000000, true, 'd9a101cc-a823-4846-ac60-3df15af92376', '2026-03-27 12:45:27.051421', '2026-03-27 12:45:35.704');
INSERT INTO public.gift_cards VALUES (12, 'HIEU-VIP', 100000000, true, 'ef851736-fe6b-4eff-867a-68915e9c1683', '2026-03-27 12:54:51.235665', '2026-03-27 12:55:11.761');
INSERT INTO public.gift_cards VALUES (13, 'CHRIS2', 800000000, true, '55109529', '2026-03-28 00:50:32.038205', '2026-03-28 00:50:46.511');


--
-- Data for Name: leaderboard; Type: TABLE DATA; Schema: public; Owner: dragonadmin
--



--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: dragonadmin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: dragonadmin
--

INSERT INTO public.sessions VALUES ('6AejeAZgHtucxF11KTv9nqIiv-zHeVaS', '{"cookie": {"path": "/", "secure": false, "expires": "2026-04-03T12:54:16.667Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "ef851736-fe6b-4eff-867a-68915e9c1683"}', '2026-04-03 14:05:03');
INSERT INTO public.sessions VALUES ('v45horl4OBIVRZpGZ8UrupGvGNJIGFpW', '{"cookie": {"path": "/", "secure": false, "expires": "2026-04-03T12:12:19.721Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "55109529"}', '2026-04-04 16:37:39');
INSERT INTO public.sessions VALUES ('8CLHbXcWvAYfwQUYPGBSI6KXjwf8OfGr', '{"cookie": {"path": "/", "secure": false, "expires": "2026-04-04T17:18:28.030Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "55109529"}', '2026-04-04 19:11:56');
INSERT INTO public.sessions VALUES ('s_BxdU_W5joa7GTAN48wd5gBzTDP0wac', '{"cookie": {"path": "/", "secure": false, "expires": "2026-04-03T12:19:32.435Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "susu"}', '2026-04-04 22:30:43');
INSERT INTO public.sessions VALUES ('h2MX3v0PE9ibWZ3IovYIWJtFH30CogJu', '{"cookie": {"path": "/", "secure": false, "expires": "2026-04-03T12:44:40.393Z", "httpOnly": true, "sameSite": "lax", "originalMaxAge": 604800000}, "userId": "d9a101cc-a823-4846-ac60-3df15af92376"}', '2026-04-04 15:26:38');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: dragonadmin
--

INSERT INTO public.users VALUES ('d9a101cc-a823-4846-ac60-3df15af92376', 'Chris', '$2b$10$eqSyGEoJAYgIiS9ozG2.5e74dJ/lPTguX5Z7n11WiwGeIUSVmC0lq', 'Chris@example.com', NULL, NULL, NULL, 550369, 0, 235, 22500000, 0, 5, 1340, '2026-03-27 12:44:40.387582', '2026-03-27 12:44:40.387582');
INSERT INTO public.users VALUES ('ef851736-fe6b-4eff-867a-68915e9c1683', 'Hieu', '$2b$10$rGODzU5yz2DEHMWetOkiSOXV2ZD5nXLO2h0voyQ/Z30z9c8VuJFZO', 'Hieu@example.com', NULL, NULL, NULL, 100001000, 0, 0, 0, 0, 0, 0, '2026-03-27 12:54:16.661294', '2026-03-27 12:54:16.661294');
INSERT INTO public.users VALUES ('susu', 'susu', '$2b$10$8N0F7y70YMxoFkuwrZX7.ukVs/qgxLbfskMgjOIvfLijzsijBY.uS', 'susu@example.com', '', '', NULL, 682638084, 0, 1550, 25000000, 0, 5, 8761, '2026-03-27 12:14:28.982265', '2026-03-28 07:49:31.89');
INSERT INTO public.users VALUES ('55109529', 'The Boss', '$2b$10$m2KMbJu6aISWLdfXXLE3k.eiZYRfPD.chBydQ3hHqWfrkXJLsn3pS', 'csp19126@gmail.com', 'Chris', 'hannah', NULL, 717889090, 0, 218, 100000000, 0, 4, 1054, '2026-03-22 15:36:13.863987', '2026-03-22 15:36:13.863987');


--
-- Data for Name: withdrawals; Type: TABLE DATA; Schema: public; Owner: dragonadmin
--



--
-- Name: achievements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: dragonadmin
--

SELECT pg_catalog.setval('public.achievements_id_seq', 24, true);


--
-- Name: conversations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: dragonadmin
--

SELECT pg_catalog.setval('public.conversations_id_seq', 1, false);


--
-- Name: deposits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: dragonadmin
--

SELECT pg_catalog.setval('public.deposits_id_seq', 3, true);


--
-- Name: game_states_id_seq; Type: SEQUENCE SET; Schema: public; Owner: dragonadmin
--

SELECT pg_catalog.setval('public.game_states_id_seq', 4, true);


--
-- Name: gift_cards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: dragonadmin
--

SELECT pg_catalog.setval('public.gift_cards_id_seq', 13, true);


--
-- Name: leaderboard_id_seq; Type: SEQUENCE SET; Schema: public; Owner: dragonadmin
--

SELECT pg_catalog.setval('public.leaderboard_id_seq', 1, false);


--
-- Name: messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: dragonadmin
--

SELECT pg_catalog.setval('public.messages_id_seq', 1, false);


--
-- Name: withdrawals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: dragonadmin
--

SELECT pg_catalog.setval('public.withdrawals_id_seq', 1, false);


--
-- PostgreSQL database dump complete
--

\unrestrict UuunlzTX733tnzblk9WJTR9edxAV0dA034gFhXAnlbmi4meK125xGJQeKyvs3bx


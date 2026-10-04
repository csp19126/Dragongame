from gradio_client import Client, handle_file
import shutil, sys
c = Client("zerogpu-aoti/wan2-2-fp8da-aoti-faster")
print(c.view_api(return_format="dict")["named_endpoints"].keys())
r = c.predict(
    input_image=handle_file(sys.argv[1]+"/out/0093.png"),
    prompt="Handheld vertical phone video at a Saigon street cafe at dusk. The young man holds his smartphone up, and both friends lean in close together looking at the glowing phone screen, amazed and excited. The friend on the right points at the phone, laughs and nods enthusiastically, saying 'this game is amazing'. The man holding the phone grins proudly. They both laugh together. The phone stays steady facing the camera. Natural realistic motion, warm evening light, bokeh lanterns and scooters behind.",
    negative_prompt="fireworks on screen, text, subtitles, distorted hands, extra fingers, deformed faces, blurry, static image, low quality",
    duration_seconds=3.5, steps=6, api_name="/generate_video")
print(r)
v = r[0]["video"] if isinstance(r[0], dict) else r[0]
shutil.copy(v, sys.argv[1]+"/wan.mp4"); print("saved")

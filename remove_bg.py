import sys
from PIL import Image

def make_transparent(img_path):
    try:
        img = Image.open(img_path)
        img = img.convert("RGBA")
        datas = img.getdata()

        newData = []
        for item in datas:
            # Change all white (and near-white) pixels to transparent
            if item[0] > 240 and item[1] > 240 and item[2] > 240:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)

        img.putdata(newData)
        img.save(img_path, "PNG")
        print(f"Successfully removed white background from {img_path}")
    except Exception as e:
        print(f"Error processing {img_path}: {e}")

if __name__ == "__main__":
    make_transparent("batman.png")
    make_transparent("spiderman.png")
    make_transparent("popeye.png")
    make_transparent("potato.png")

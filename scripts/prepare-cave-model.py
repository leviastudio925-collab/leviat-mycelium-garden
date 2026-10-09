"""Keep cave geometry intact; resize embedded textures for static web hosting.

Usage: python scripts/prepare-cave-model.py SOURCE.glb public/models/cave.glb
Requires Pillow. The supplied original is never overwritten.
"""
import io
import json
from pathlib import Path
import struct
import sys
from PIL import Image


def prepare(source, destination):
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve():
        raise ValueError('Choose a separate output; retain the original cave model')
    data = source.read_bytes()
    json_length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + json_length])
    binary = data[28 + json_length:]
    images = {image['bufferView']: image for image in document.get('images', [])}
    output = bytearray()
    for index, view in enumerate(document['bufferViews']):
        start = view.get('byteOffset', 0)
        chunk = binary[start:start + view['byteLength']]
        if index in images:
            image = Image.open(io.BytesIO(chunk))
            image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
            encoded = io.BytesIO()
            image.save(encoded, format='PNG', optimize=True)
            chunk = encoded.getvalue()
            images[index]['mimeType'] = 'image/png'
            print(images[index].get('name', 'texture'), image.size, len(chunk))
        output.extend(b'\0' * (-len(output) % 4))
        view['byteOffset'] = len(output)
        view['byteLength'] = len(chunk)
        output.extend(chunk)
    document['buffers'][0]['byteLength'] = len(output)
    output.extend(b'\0' * (-len(output) % 4))
    metadata = json.dumps(document, separators=(',', ':')).encode()
    metadata += b' ' * (-len(metadata) % 4)
    length = 28 + len(metadata) + len(output)
    result = struct.pack('<III', 0x46546C67, 2, length)
    result += struct.pack('<II', len(metadata), 0x4E4F534A) + metadata
    result += struct.pack('<II', len(output), 0x004E4942) + output
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(result)
    print(f'Web cave: {len(data):,} -> {length:,} bytes; geometry unchanged')


if __name__ == '__main__':
    prepare(sys.argv[1], sys.argv[2])

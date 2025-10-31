from flask import Flask, jsonify
import requests
from bs4 import BeautifulSoup

app = Flask(__name__)

def obtener_iva_venezuela():
    # Ejemplo de web scraping (¡Esto es solo un ejemplo y puede romperse!)
    url = "http://www.bcv.org.ve/"
    try:
        response = requests.get(url)
        response.raise_for_status()  # Lanza una excepción si la petición falla
        soup = BeautifulSoup(response.content, 'html.parser')
        # **Aquí necesitarías inspeccionar la página del BCV para encontrar el selector correcto**
        # Ejemplo hipotético:
        iva_element = soup.find('span', id='tasa-iva')
        if iva_element:
            iva_texto = iva_element.text.strip().replace('%', '').replace(',', '.')
            return float(iva_texto) / 100
        else:
            return 0.16 # Valor por defecto o manejar el error
    except requests.exceptions.RequestException as e:
        print(f"Error al obtener el IVA del BCV: {e}")
        return 0.16 # Valor por defecto o manejar el error

@app.route('/api/iva')
def obtener_iva():
    iva = obtener_iva_venezuela()
    return jsonify({'iva': iva})

if __name__ == '__main__':
    app.run(debug=True)
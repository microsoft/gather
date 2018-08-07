"""
Based on the tutorial at:
https://jupyter-notebook.readthedocs.io/en/latest/extending/handlers.html
"""

from notebook.utils import url_path_join
from notebook.base.handlers import IPythonHandler
from tornado.web import MissingArgumentError
import portalocker
import os.path


# Initialize the log directory
LOG_DIR = os.path.join(os.path.expanduser("~"), ".jupyter")
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)
LOG_PATH = os.path.join(LOG_DIR, "log.txt")


def _jupyter_server_extension_paths():
    return [{
        "module": "gather_logger"
    }]


def load_jupyter_server_extension(nb_server_app):
    nb_server_app.log.info("Starting the Gathering Logger extension")
    web_app = nb_server_app.web_app
    host_pattern = '.*$'
    route_pattern = url_path_join(web_app.settings['base_url'], '/log')
    web_app.add_handlers(host_pattern, [(route_pattern, LogHandler)])
    nb_server_app.log.info("Successfully started the Gathering Logger extension")


class LogHandler(IPythonHandler):

    def post(self):
        data = self.request.body.decode('utf-8')
        with portalocker.Lock(LOG_PATH, mode='a', timeout=1) as fh:
            fh.write(data + "\n")
        self.write({ "result": "OK" })
# livecells

Tool for gathering, recalling, comparing implicit versions of code in Jupyter Notebook / Lab.

## Prerequisites

* JupyterLab

## Jupyter Lab extension

```bash
jupyter labextension install livecells
```

### Development

For a development install (requires npm version 4 or later), do the following in the repository directory:

```bash
npm install
jupyter labextension link .
```

To rebuild the package and the JupyterLab app:

```bash
npm run build
jupyter lab build
```

## Notebook extension

### Frontend extension

```bash
npm run build
npm run build_nb_extension
npm run install_nb_extension
```

#### Troubleshooting

##### The extension UI doesn't get loaded

Sometimes you might reload the page and see that the buttons on the page are missing. I haven't been able to track the cause of the issue. [This Stack Overflow post](https://stackoverflow.com/questions/11991218/undefined-object-being-passed-via-requirejs) suggests the issue might be with circular `require` dependencies. The problem has disappeared when I have:

* Deleted the virtual environment containing Jupyter, and installing it globally, or
* Removed what I thought might be circular dependencies in the project

But I don't know if either of these *really* fixed the issue. They're worth trying if the gathering UI disappears.

### Backend (logging) extension (optional)

Then run `jupyter notebook` and the extension will be running.

If you want to add logging to the project, look in the `src/nb/python` directory. This Python plugin needs to be installed to receive logging requests and save them to file (`~/.jupyter/events.txt`). To register this Python extension in Jupyter notebook or lab, see this guide: https://jupyter-notebook.readthedocs.io/en/latest/extending/handlers.html. As of the time of this writing, installation involves:

Install dependencies for the plugin:

```bash
pip install portalocker
```

Build the project:
```bash
cd src/nb/python
python setup.py install
```

Then enable the extension by going to the `python` directory for the notebook extension, and running:

```bash
jupyter serverextension enable --py gather_logger
```

We aren't yet bundling this extension, nor do we have a good way to develop the plugin in development mode yet. To do either of these two things, we might follow the instructions here: https://jupyter-notebook.readthedocs.io/en/latest/extending/bundler_extensions.html.
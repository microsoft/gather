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

```bash
npm run build
npm run build_nb_extension
npm run install_nb_extension
```

Then run `jupyter notebook` and the extension will be running.
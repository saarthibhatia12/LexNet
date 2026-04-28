from pathlib import Path

from setuptools import find_packages, setup


def load_requirements() -> list[str]:
    requirements_path = Path(__file__).with_name("requirements.txt")
    requirements = requirements_path.read_text(encoding="utf-8").splitlines()
    return [
        requirement.strip()
        for requirement in requirements
        if requirement.strip() and not requirement.startswith("#")
    ]


setup(
    name="lexnet-nlp",
    version="0.1.0",
    packages=find_packages(),
    include_package_data=True,
    python_requires=">=3.11",
    install_requires=load_requirements(),
)

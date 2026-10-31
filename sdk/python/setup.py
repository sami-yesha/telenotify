from setuptools import find_packages, setup

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="telenotify",
    version="0.1.0",
    author="sami-yesha",
    description="Official Python client for Telenotify: Telegram-first customer notifications and phone verification",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://telenotify.duckdns.org",
    packages=find_packages(),
    package_data={"telenotify": ["py.typed"]},
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.8",
)


FROM node:18.15.0 as base

# Install system dependencies
RUN apt-get update && apt-get install -y vim redis-tools postgresql-client htop curl libpq-dev build-essential libjemalloc-dev graphviz ghostscript

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Poppler tools
WORKDIR /tmp/
COPY ./connectors/admin/docker_build/install_poppler_tools.sh ./
RUN chmod +x ./install_poppler_tools.sh && \
    ./install_poppler_tools.sh && \
    ldconfig

# Set library path for Poppler
ENV LD_LIBRARY_PATH=/usr/local/lib

# Set the working directory to /dust
WORKDIR /dust

# Types dependencies
COPY /types/package*.json ./types/
RUN cd types && npm ci

# Connectors dependencies
COPY ./connectors/package*.json ./connectors/
RUN cd connectors && npm ci

# Front dependencies
COPY /front/package*.json ./front/
RUN cd front && npm ci

# Now copy the rest of the code
COPY /types ./types/
RUN cd types && npm run build

COPY ./connectors ./connectors/
RUN cd connectors && npm run build

COPY /front ./front/
RUN cd front && FRONT_DATABASE_URI="sqlite:foo.sqlite" npm run build

# Core code and build
COPY /core ./core/
RUN cd core && cargo build --release

# Set the default start directory to /dust when SSH into the container
WORKDIR /dust

# Wraning and prompt
RUN echo "echo -e \"\033[0;31mWARNING: This is a PRODUCTION system!\033[0m\"" >> /root/.bashrc
RUN echo "export PS1='\[\e[0;31m\]prodbox\[\e[0m\]:\w\$ '" >> /root/.bashrc

ENV _RJEM_MALLOC_CONF=prof_leak:true,lg_prof_sample:0,prof_final:true

# Set a default command
CMD ["bash"]

#include <algorithm>
#include <cstddef>
#include <new>

extern "C" int riose_cpp_update_metabolism(std::size_t count, const double *input, double *output) {
    if (count > 100000) return -1;
    if (count != 0 && (input == nullptr || output == nullptr)) return -2;
    for (std::size_t i = 0; i < count; ++i) {
        const double weight = input[i * 4];
        const double energy = input[i * 4 + 1];
        const double intake = input[i * 4 + 2];
        const bool resting = input[i * 4 + 3] != 0.0;
        const double gain = (intake - 5.3 * (weight / 360.0) / 24.0) * 0.22;
        output[i * 2] = std::max(weight + gain, 200.0);
        output[i * 2 + 1] = std::clamp(energy + (resting ? 5.0 : intake * 4.0 - 1.5), 0.0, 100.0);
    }
    return 0;
}

extern "C" int riose_cpp_allocate(std::size_t count, double **input, double **output) {
    if (count > 100000 || input == nullptr || output == nullptr) return -1;
    *input = new (std::nothrow) double[count * 4];
    *output = new (std::nothrow) double[count * 2];
    if (*input == nullptr || *output == nullptr) {
        delete[] *input; delete[] *output; *input = nullptr; *output = nullptr; return -2;
    }
    return 0;
}

extern "C" void riose_cpp_free(double *input, double *output) { delete[] input; delete[] output; }

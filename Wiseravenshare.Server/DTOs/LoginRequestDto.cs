using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Models.DTOs
{
    public class LoginRequestDto
    {
        [Required(ErrorMessage = "Email or username is required")]
        public string EmailOrUsername { get; set; }

        [Required(ErrorMessage = "Password is required")]
        public string Password { get; set; }

        public bool RememberMe { get; set; } = false;
    }
}
using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Models.DTOs
{
    public class RefreshTokenRequestDto
    {
        [Required]
        public string AccessToken { get; set; }

        [Required]
        public string RefreshToken { get; set; }
    }
}
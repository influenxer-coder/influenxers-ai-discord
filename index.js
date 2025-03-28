// index.js - Main entry point for the bot
require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  Events,
  AttachmentBuilder
} = require('discord.js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Configure the client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.API_KEY,
});

// Path to store user session data
const SESSION_FILE = path.join(__dirname, 'sessionData.json');

// Define file paths for response JSON files in the response/ subdirectory
const RESPONSE_FILES = {
  'hook': path.join(__dirname, 'response', 'hookResponse.json'),
  'script': path.join(__dirname, 'response', 'scriptResponse.json'),
  'story': path.join(__dirname, 'response', 'storyResponse.json'),
  'ideas': path.join(__dirname, 'response', 'ideasResponse.json'),
  'fix': path.join(__dirname, 'response', 'fixResponse.json'),
  'ready': path.join(__dirname, 'response', 'readyResponse.json'),
  'analyze': path.join(__dirname, 'response', 'analysisResponse.json')
};

// Define color themes for each intent type - Apple-inspired color palette
const COLOR_THEMES = {
  'hook': ['#5AC8FA', '#147EFB', '#0A84FF'], // Blue gradient
  'script': ['#FF2D55', '#FF375F', '#FF3B30'], // Pink/Red gradient
  'story': ['#5856D6', '#AF52DE', '#BF5AF2'], // Purple gradient
  'ideas': ['#FFD60A', '#FFCC00', '#FF9500'], // Yellow/Orange gradient
  'fix': ['#32D74B', '#30D158', '#34C759'], // Green gradient
  'ready': ['#FF9F0A', '#FF9F0A', '#FF9500'], // Orange gradient
  'analyze': ['#64D2FF', '#5AC8FA', '#0A84FF']  // Light Blue gradient
};

// DALL-E configuration
const GENERATE_IMAGES = true; // Set to false to disable image generation for testing
const IMAGE_FOLDER = path.join(__dirname, 'generated_images');
const MAX_IMAGES_PER_REQUEST = 3; // Limit the number of images to generate per request

// Create image folder if it doesn't exist
if (!fs.existsSync(IMAGE_FOLDER)) {
  fs.mkdirSync(IMAGE_FOLDER, { recursive: true });
  console.log('Created image folder for storing generated images');
}

// Session state to store user information
let sessionState = {};

// Load existing sessions from file
function loadSessions() {
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const data = fs.readFileSync(SESSION_FILE, 'utf8');
      sessionState = JSON.parse(data);
      console.log('Sessions loaded successfully');
    } catch (err) {
      console.error("Failed to load session file:", err);
      // Initialize empty session state if file cannot be read
      sessionState = {};
    }
  } else {
    console.log('No session file found, creating new session state');
    sessionState = {};
  }
}

// Save sessions to file
function saveSessions() {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionState, null, 2));
    console.log('Sessions saved successfully');
  } catch (err) {
    console.error("Failed to save session file:", err);
  }
}

/**
 * Generate an image using DALL-E based on the provided prompt
 * @param {string} prompt - The image prompt to send to DALL-E
 * @param {string} filename - The filename to save the image as
 * @returns {Promise<string>} - The path to the saved image
 */
async function generateImageWithDallE(prompt, filename) {
  if (!GENERATE_IMAGES) {
    console.log(`Image generation disabled. Would have generated: "${prompt}"`);
    return null;
  }

  try {
    console.log(`Generating image for prompt: "${prompt}"`);
    
    const response = await openai.images.generate({
      model: "dall-e-3", // Use DALL-E 3 for high quality images
      prompt: prompt,
      n: 1,
      size: "1024x1024", // Standard size for good quality
      response_format: "b64_json" // Get base64 data directly
    });

    // Extract image data
    const imageData = response.data[0].b64_json;
    const imagePath = path.join(IMAGE_FOLDER, `${filename}.png`);
    
    // Save the image to the file system
    fs.writeFileSync(imagePath, Buffer.from(imageData, 'base64'));
    console.log(`Image saved to ${imagePath}`);
    
    return imagePath;
  } catch (error) {
    console.error("Error generating image with DALL-E:", error);
    return null;
  }
}

/**
 * Generate a creative prompt for DALL-E based on script content
 * @param {Object} segment - The script segment to generate a prompt for
 * @param {string} productName - The name of the product
 * @returns {string} - The generated prompt
 */
function generateDallEPrompt(segment, productName, style = "cinematic") {
  let basePrompt = '';
  
  if (segment.visual_direction) {
    basePrompt += segment.visual_direction;
  } else if (segment.script) {
    basePrompt += segment.script;
  }
  
  // Add product name if available
  if (productName && productName !== "your product") {
    basePrompt += ` featuring ${productName}`;
  }

  basePrompt += `. Show a female creator in the scene`;

  // Add style enhancements
  const styleMap = {
    "cinematic": "high-quality cinematic shot with professional lighting",
    "minimal": "clean, minimalist composition with soft lighting",
    "vibrant": "vibrant colors with dynamic composition",
    "tiktok": "vertical format optimized for TikTok, trendy aesthetic",
    "instagram": "polished Instagram-ready composition with perfect lighting",
    "lineart": "black-and-white minimalist line art illustration, clean professional sketch style"
  };
  
  const styleDescription = styleMap[style] || styleMap["cinematic"];
  
  // Construct final prompt with style and ensure it's appropriate for TikTok/Instagram content
  const finalPrompt = `Create a ${styleDescription} of: ${basePrompt}. The image should be clean and minimal, styled like elegant line art suitable for professional content marketing.`;
  
  return finalPrompt;
}

// Load sessions on startup
loadSessions();

// Bot ready event
client.once(Events.ClientReady, () => {
  console.log(`✅ Influenxers AI bot is online! Logged in as ${client.user.tag}`);
});

// Helper function to read a JSON response file
function readResponseFile(intentType) {
  try {
    const filePath = RESPONSE_FILES[intentType];
    if (!filePath) {
      throw new Error(`No response file for intent: ${intentType}`);
    }
    
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File does not exist: ${filePath}`);
      // Return a default response structure
      return {
        creator_personalization: {
          content_style: "Your authentic voice is your strongest asset",
          audience_insight: "Your audience appreciates your honesty and expertise"
        },
        hook_options: [
          {
            text: "Default hook text - file not found",
            style: "Default style",
            predicted_engagement: "Average",
            strength: "This is a fallback response as the response file was not found"
          }
        ],
        success_factors: [
          "This is a fallback response"
        ],
        content_guidance: {
          key_talking_points: [
            "Point 1", 
            "Point 2", 
            "Point 3"
          ]
        }
      };
    }
    
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${intentType} response file:`, error);
    // Return a default response structure in case of error
    return {
      creator_personalization: {
        content_style: "Your authentic voice is your strongest asset",
        audience_insight: "Your audience appreciates your honesty and expertise"
      },
      hook_options: [
        {
          text: "Default hook text - error reading file",
          style: "Default style",
          predicted_engagement: "Average",
          strength: "This is a fallback response due to an error reading the response file"
        }
      ],
      success_factors: [
        "This is a fallback response"
      ],
      content_guidance: {
        key_talking_points: [
          "Point 1", 
          "Point 2", 
          "Point 3"
        ]
      }
    };
  }
}

// Helper function to extract product name from brief
function extractProductName(brief) {
  if (!brief) return "your product";
  
  const productMatch = brief.match(/product(?:\s+name)?[:\s]+([^\n.,]+)/i);
  if (productMatch) {
    return productMatch[1].trim();
  }
  
  // Try other patterns if the first one fails
  const nameMatch = brief.match(/name[:\s]+([^\n.,]+)/i);
  if (nameMatch) {
    return nameMatch[1].trim();
  }
  
  // Default fallback
  return "your product";
}

// Helper function to capitalize first letter
function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Get emoji for intent
function getEmojiForIntent(intent) {
  const emojiMap = {
    'hook': '🪝',
    'script': '📝',
    'story': '📖',
    'ideas': '💡',
    'fix': '🔧',
    'ready': '🎬',
    'analyze': '📊'
  };
  
  return emojiMap[intent] || '✨';
}

// Get icon URL for intent
function getIconForIntent(intent) {
  // You can replace these with actual icon URLs in production
  const iconMap = {
    'hook': 'https://cdn-icons-png.flaticon.com/512/7693/7693271.png',
    'script': 'https://cdn-icons-png.flaticon.com/512/2665/2665632.png',
    'story': 'https://cdn-icons-png.flaticon.com/512/3783/3783007.png',
    'ideas': 'https://cdn-icons-png.flaticon.com/512/476/476494.png',
    'fix': 'https://cdn-icons-png.flaticon.com/512/5261/5261933.png',
    'ready': 'https://cdn-icons-png.flaticon.com/512/1404/1404945.png',
    'analyze': 'https://cdn-icons-png.flaticon.com/512/2984/2984977.png'
  };
  
  return iconMap[intent] || 'https://cdn-icons-png.flaticon.com/512/1033/1033490.png';
}

// Helper function to create a branded header for all responses
function createBrandedHeader(name, intent, productName) {
  const emoji = getEmojiForIntent(intent);
  const colors = COLOR_THEMES[intent] || ['#000000'];
  
  return new EmbedBuilder()
    .setColor(colors[0])
    .setTitle(`${emoji} ${capitalizeFirstLetter(intent)} for ${productName}`)
    .setDescription(`Hi ${name}, I've created this personalized ${intent} to help your content stand out.`)
    .setFooter({ 
      text: 'Influenxers AI • Your Creator Success Coach', 
      iconURL: 'https://cdn-icons-png.flaticon.com/512/6828/6828736.png' 
    })
    .setTimestamp();
}

// Helper function to create buttons for responses
function createActionButtons(intent) {
  const row = new ActionRowBuilder();
  
  // Add intent-specific buttons
  switch(intent) {
    case 'hook':
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('more_hooks')
          .setLabel('Generate More')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('creator_focus')
          .setLabel('More Creator Style')
          .setEmoji('👤')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('save_hook')
          .setLabel('Save This Hook')
          .setEmoji('💾')
          .setStyle(ButtonStyle.Success)
      );
      break;
    
    case 'script':
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('refine_script')
          .setLabel('Refine Script')
          .setEmoji('✏️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('add_visuals')
          .setLabel('Add Visual Notes')
          .setEmoji('🎨')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('save_script')
          .setLabel('Save This Script')
          .setEmoji('💾')
          .setStyle(ButtonStyle.Success)
      );
      break;
      
    case 'story':
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('more_emotional')
          .setLabel('More Emotional')
          .setEmoji('❤️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('more_authentic')
          .setLabel('More Authentic')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('save_story')
          .setLabel('Save This Story')
          .setEmoji('💾')
          .setStyle(ButtonStyle.Success)
      );
      break;
    
    case 'ideas':
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('more_ideas')
          .setLabel('More Ideas')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('trending_ideas')
          .setLabel('Trending Ideas')
          .setEmoji('📈')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('save_idea')
          .setLabel('Save This Idea')
          .setEmoji('💾')
          .setStyle(ButtonStyle.Success)
      );
      break;
      
    case 'fix':
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('apply_fixes')
          .setLabel('Apply All Fixes')
          .setEmoji('🛠️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('explain_more')
          .setLabel('Explain More')
          .setEmoji('❓')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('save_fixes')
          .setLabel('Save These Fixes')
          .setEmoji('💾')
          .setStyle(ButtonStyle.Success)
      );
      break;
      
    case 'ready':
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('download_package')
          .setLabel('Download Package')
          .setEmoji('📥')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('refine_shots')
          .setLabel('Refine Shots')
          .setEmoji('🎯')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('calendar_add')
          .setLabel('Add to Calendar')
          .setEmoji('📅')
          .setStyle(ButtonStyle.Success)
      );
      break;
      
    case 'analyze':
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('deep_insights')
          .setLabel('Deeper Insights')
          .setEmoji('🔍')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('fix_issues')
          .setLabel('Fix Issues')
          .setEmoji('🔧')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('save_analysis')
          .setLabel('Save Analysis')
          .setEmoji('💾')
          .setStyle(ButtonStyle.Success)
      );
      break;
      
    default:
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('regenerate')
          .setLabel('Regenerate')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('save_response')
          .setLabel('Save Response')
          .setEmoji('💾')
          .setStyle(ButtonStyle.Success)
      );
  }
  
  return row;
}

// Function to create a second row of feedback buttons
function createFeedbackButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('feedback_love')
        .setLabel('Love it!')
        .setEmoji('❤️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('feedback_meh')
        .setLabel('It\'s OK')
        .setEmoji('😐')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('feedback_help')
        .setLabel('Need Help')
        .setEmoji('🆘')
        .setStyle(ButtonStyle.Secondary)
    );
}

// Helper function to get emoji for score
function getScoreEmoji(score) {
  if (score >= 8) return '🔥';
  if (score >= 6) return '👍';
  if (score >= 4) return '😐';
  return '👎';
}

// Helper function to get word for score
function getScoreWord(score) {
  if (score >= 8.5) return 'Excellent';
  if (score >= 7.5) return 'Very Good';
  if (score >= 6.5) return 'Good';
  if (score >= 5.5) return 'Average';
  if (score >= 4.5) return 'Fair';
  if (score >= 3.5) return 'Needs Work';
  return 'Poor';
}

// Updated function to create beautiful, Apple-inspired cards for hook responses
function createHookCard(name, responseData, productName) {
  const colors = COLOR_THEMES['hook'];
  
  // Main card with personalized greeting and context
  const mainEmbed = createBrandedHeader(name, 'hook', productName);
    
  // Add personalization insight if available
  if (responseData.creator_personalization) {
    const personalInsight = responseData.creator_personalization;
    mainEmbed.addFields({ 
      name: '✨ Your Creator Superpower', 
      value: personalInsight.content_style || "Your authentic voice is your strongest asset"
    });
    
    if (personalInsight.audience_insight) {
      mainEmbed.addFields({ 
        name: '👥 Your Audience Insight', 
        value: personalInsight.audience_insight
      });
    }
  }
  
  // Create separate embed for each hook option - Apple-style simplicity
  const hookEmbeds = responseData.hook_options.map((hook, index) => {
    const hookEmbed = new EmbedBuilder()
      .setColor(colors[index % colors.length])
      .setTitle(`Hook ${index + 1}`)
      .setDescription(`"${hook.text}"`);
    
    // Add style and predicted engagement if available
    const fields = [];
    if (hook.style) {
      fields.push({ 
        name: '🎭 Style', 
        value: hook.style, 
        inline: true 
      });
    }
    
    if (hook.predicted_engagement) {
      fields.push({ 
        name: '📈 Predicted Engagement', 
        value: hook.predicted_engagement, 
        inline: true 
      });
    }
    
    if (fields.length > 0) {
      hookEmbed.addFields(fields);
    }
      
    // Add visual direction if available
    const visualKey = `hook_${index + 1}_visuals`;
    if (responseData.visual_direction && responseData.visual_direction[visualKey]) {
      hookEmbed.addFields({ 
        name: '🎬 Visual Direction', 
        value: responseData.visual_direction[visualKey] 
      });
    }
    
    // Add strength/reasoning for this hook
    if (hook.strength) {
      hookEmbed.addFields({ 
        name: '💪 Why This Works For Your Audience', 
        value: hook.strength 
      });
    }
    
    return hookEmbed;
  });
  
  // Create success factors embed if available
  let successEmbed = null;
  if (responseData.success_factors && responseData.success_factors.length > 0) {
    successEmbed = new EmbedBuilder()
      .setColor('#32D74B') // Apple green
      .setTitle('🏆 Why These Will Perform Well')
      .setDescription(responseData.success_factors.map(factor => `• ${factor}`).join('\n'));
  }
  
  // Create talking points embed if available
  let guidanceEmbed = null;
  if (responseData.content_guidance && responseData.content_guidance.key_talking_points) {
    guidanceEmbed = new EmbedBuilder()
      .setColor('#FF9F0A') // Apple orange
      .setTitle('🎯 Key Talking Points')
      .setDescription(responseData.content_guidance.key_talking_points.map(point => `• ${point}`).join('\n'));
  }
  
  // Combine all embeds
  const allEmbeds = [mainEmbed, ...hookEmbeds];
  if (successEmbed) allEmbeds.push(successEmbed);
  if (guidanceEmbed) allEmbeds.push(guidanceEmbed);
  
  // Create buttons
  const actionRow = createActionButtons('hook');
  const feedbackRow = createFeedbackButtons();
  
  return { embeds: allEmbeds, components: [actionRow, feedbackRow] };
}

// Helper function to get emoji for script segment type
function getEmojiForSegment(type) {
  const emojiMap = {
    'intro': '👋',
    'problem': '❓',
    'solution': '💡',
    'evidence': '✅',
    'cta': '🔗'
  };
  
  return emojiMap[type] || '📝';
}

// Create specialized card for script response
function createScriptCard(name, responseData, productName) {
  const colors = COLOR_THEMES['script'];
  
  // Main embed with overview
  const mainEmbed = createBrandedHeader(name, 'script', productName);
  
  // Add personalization if available
  if (responseData.creator_personalization) {
    const personalInsight = responseData.creator_personalization;
    mainEmbed.addFields({ 
      name: '✨ Your Content Style', 
      value: personalInsight.content_style || "Your authentic voice is your strongest asset"
    });
  }
  
  // Create hook embed
  const hookEmbed = new EmbedBuilder()
    .setColor(colors[0])
    .setTitle('🪝 Opening Hook')
    .setDescription(`"${responseData.script_content.hook}"`);
  
  // Create embeds for each script segment
  const segmentEmbeds = responseData.script_content.segments.map((segment, index) => {
    const segmentEmbed = new EmbedBuilder()
      .setColor(colors[index % colors.length])
      .setTitle(`${getEmojiForSegment(segment.type)} ${capitalizeFirstLetter(segment.type)}`)
      .setDescription(`"${segment.script}"`);
    
    // Add visual direction
    if (segment.visual_direction) {
      segmentEmbed.addFields({ 
        name: '🎬 Visual', 
        value: segment.visual_direction,
        inline: true
      });
    }
    
    // Add on-screen text
    if (segment.on_screen_text) {
      segmentEmbed.addFields({ 
        name: '📝 On-Screen Text', 
        value: segment.on_screen_text,
        inline: true
      });
    }
    
    // Add performance note if available
    if (segment.performance_note) {
      segmentEmbed.addFields({ 
        name: '📊 Performance Note', 
        value: segment.performance_note 
      });
    }
    
    return segmentEmbed;
  });
  
  // Success factors embed
  let successEmbed = null;
  if (responseData.success_factors && responseData.success_factors.length > 0) {
    successEmbed = new EmbedBuilder()
      .setColor('#32D74B') // Apple green
      .setTitle('🏆 Why This Will Perform Well')
      .setDescription(responseData.success_factors.map(factor => `• ${factor}`).join('\n'));
  }
  
  // Create embeds array and add all embeds
  const allEmbeds = [mainEmbed, hookEmbed, ...segmentEmbeds];
  if (successEmbed) allEmbeds.push(successEmbed);
  
  // Create buttons
  const actionRow = createActionButtons('script');
  const feedbackRow = createFeedbackButtons();
  
  return { embeds: allEmbeds, components: [actionRow, feedbackRow] };
}

/**
 * Enhanced function to create script card with DALL-E generated images
 */
async function createScriptCardWithImages(name, responseData, productName) {
  // First create the basic script card
  const basicCard = createScriptCard(name, responseData, productName);
  
  // Check if we should generate images
  if (!GENERATE_IMAGES) {
    return basicCard;
  }
  
  try {
    // Generate a hero image for the main hook
    const hookPrompt = generateDallEPrompt(
      { script: responseData.script_content.hook, visual_direction: "Opening shot" }, 
      productName,
      "cinematic"
    );
    
    const hookImagePath = await generateImageWithDallE(
      hookPrompt, 
      `script_hook_${Date.now()}`
    );
    
    // Prepare attachments array
    const attachments = [];
    
    // If hook image was generated successfully, add it
    if (hookImagePath) {
      const hookAttachment = new AttachmentBuilder(hookImagePath)
        .setName('hook_image.png')
        .setDescription('Visual representation of your opening hook');
      
      attachments.push(hookAttachment);
      
      // Modify the hook embed to include the image
      if (basicCard.embeds.length > 1) { // Main card is at index 0, hook at index 1
        basicCard.embeds[1].setImage('attachment://hook_image.png');
      }
    }
    
    // Generate images for key segments (limit to ensure we don't hit rate limits)
    const segments = responseData.script_content.segments;
    const segmentsToVisualize = segments.length > 2 ? 
      [segments[0], segments[segments.length - 1]] : // First and last if more than 2
      segments; // Otherwise all segments
    
    // Count to ensure we don't exceed max images
    let imageCount = hookImagePath ? 1 : 0;
    
    // Generate images for selected segments
    for (let i = 0; i < segmentsToVisualize.length; i++) {
      if (imageCount >= MAX_IMAGES_PER_REQUEST) break;
      
      const segment = segmentsToVisualize[i];
      const segmentPrompt = generateDallEPrompt(segment, productName, "tiktok");
      
      const segmentImagePath = await generateImageWithDallE(
        segmentPrompt, 
        `script_segment_${i}_${Date.now()}`
      );
      
      if (segmentImagePath) {
        const segmentAttachment = new AttachmentBuilder(segmentImagePath)
          .setName(`segment_${i}_image.png`)
          .setDescription(`Visual for ${segment.type} segment`);
        
        attachments.push(segmentAttachment);
        
        // Find the corresponding embed index (main card + hook + previous segments)
        const embedIndex = 2 + i; // Main card at 0, hook at 1, segments start at 2
        
        if (basicCard.embeds.length > embedIndex) {
          basicCard.embeds[embedIndex].setImage(`attachment://segment_${i}_image.png`);
        }
        
        imageCount++;
      }
    }
    
    // Add attachments to the response
    if (attachments.length > 0) {
      basicCard.files = attachments;
    }
    
    return basicCard;
  } catch (error) {
    console.error('Error creating script card with images:', error);
    // Return the basic card without images if there's an error
    return basicCard;
  }
}

// Helper function to get emoji for story segment type
function getEmojiForStorySegment(type) {
  const emojiMap = {
    'problem_establishment': '😟',
    'struggle': '😖',
    'discovery': '💡',
    'transformation': '✨',
    'sharing': '🤝'
  };
  
  return emojiMap[type] || '📝';
}

// Create specialized card for story response
function createStoryCard(name, responseData, productName) {
  const colors = COLOR_THEMES['story'];
  
  // Main embed with overview
  const mainEmbed = createBrandedHeader(name, 'story', productName);
  
  // Add personalization if available
  if (responseData.creator_personalization) {
    const personalInsight = responseData.creator_personalization;
    mainEmbed.addFields({ 
      name: '✨ Your Storytelling Strength', 
      value: personalInsight.content_style || "Your authentic storytelling approach resonates with your audience"
    });
    
    if (personalInsight.audience_insight) {
      mainEmbed.addFields({ 
        name: '👥 Audience Connection', 
        value: personalInsight.audience_insight
      });
    }
  }
  
  // Create narrative theme embed
  if (responseData.story_content && responseData.story_content.narrative_theme) {
    mainEmbed.addFields({ 
      name: '📖 Narrative Theme', 
      value: responseData.story_content.narrative_theme
    });
  }
  
  // Create hook embed
  const hookEmbed = new EmbedBuilder()
    .setColor(colors[0])
    .setTitle('🪝 Story Hook')
    .setDescription(`"${responseData.story_content.hook}"`);
  
  // Create embeds for each story segment
  const segmentEmbeds = responseData.story_content.segments.map((segment, index) => {
    const segmentEmbed = new EmbedBuilder()
      .setColor(colors[index % colors.length])
      .setTitle(`${getEmojiForStorySegment(segment.type)} ${capitalizeFirstLetter(segment.type.replace(/_/g, ' '))}`)
      .setDescription(`"${segment.script}"`);
    
    // Add visual direction
    if (segment.visual_direction) {
      segmentEmbed.addFields({ 
        name: '🎬 Visual', 
        value: segment.visual_direction,
        inline: true
      });
    }
    
    // Add emotional tone
    if (segment.emotional_tone) {
      segmentEmbed.addFields({ 
        name: '💓 Emotional Tone', 
        value: segment.emotional_tone,
        inline: true
      });
    }
    
    // Add audience connection if available
    if (segment.audience_connection) {
      segmentEmbed.addFields({ 
        name: '👥 Audience Connection', 
        value: segment.audience_connection
      });
    }
    
    return segmentEmbed;
  });
  
  // Authenticity boosters embed
  let authenticityEmbed = null;
  if (responseData.authenticity_boosters && responseData.authenticity_boosters.length > 0) {
    authenticityEmbed = new EmbedBuilder()
      .setColor('#32D74B') // Apple green
      .setTitle('✨ Authenticity Boosters')
      .setDescription(responseData.authenticity_boosters.map(tip => `• ${tip}`).join('\n'));
  }
  
  // Create embeds array and add all embeds
  const allEmbeds = [mainEmbed, hookEmbed, ...segmentEmbeds];
  if (authenticityEmbed) allEmbeds.push(authenticityEmbed);
  
  // Create buttons
  const actionRow = createActionButtons('story');
  const feedbackRow = createFeedbackButtons();
  
  return { embeds: allEmbeds, components: [actionRow, feedbackRow] };
}

// Create specialized card for ideas response
function createIdeasCard(name, responseData, productName) {
  const colors = COLOR_THEMES['ideas'];
  
  // Main embed with overview
  const mainEmbed = createBrandedHeader(name, 'ideas', productName);
  
  // Add personalization if available
  if (responseData.creator_personalization) {
    const personalInsight = responseData.creator_personalization;
    if (personalInsight.audience_insight) {
      mainEmbed.addFields({ 
        name: '👥 Your Audience Insight', 
        value: personalInsight.audience_insight
      });
    }
    
    if (personalInsight.content_style) {
      mainEmbed.addFields({ 
        name: '✨ Your Content Strength', 
        value: personalInsight.content_style
      });
    }
  }
  
  // Check if video_ideas exists and has at least one item
  if (!responseData.video_ideas || responseData.video_ideas.length === 0) {
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF3B30') // Apple red
      .setTitle('❌ Error: No Video Ideas Found')
      .setDescription('No video ideas were found in the response data.');
    
    return { embeds: [mainEmbed, errorEmbed], components: [] };
  }
  
  // Main idea concept - featured
  const mainIdea = responseData.video_ideas[0];
  
  const featuredEmbed = new EmbedBuilder()
    .setColor(colors[0])
    .setTitle(`💡 Featured Concept: ${mainIdea.concept}`)
    .setDescription(`"${mainIdea.hook}"`);
  
  if (mainIdea.audience_alignment) {
    featuredEmbed.addFields({ 
      name: '👥 Audience Alignment', 
      value: mainIdea.audience_alignment
    });
  }
  
  // Structure embeds for featured idea
  const structureEmbeds = [];
  
  if (mainIdea.structure && mainIdea.structure.length > 0) {
    for (let i = 0; i < Math.min(mainIdea.structure.length, 4); i++) {
      const sceneEmbed = new EmbedBuilder()
        .setColor(colors[i % colors.length])
        .setTitle(`🎬 Scene ${i + 1}`);
      
      let description = `**Script:** ${mainIdea.structure[i]}\n`;
      
      if (mainIdea.key_visuals && mainIdea.key_visuals.length > 0) {
        description += `**Visual:** ${mainIdea.key_visuals[i % mainIdea.key_visuals.length]}\n`;
      }
      
      sceneEmbed.setDescription(description);
      structureEmbeds.push(sceneEmbed);
    }
  }
  
  // Performance prediction embed
  let performanceEmbed = null;
  if (mainIdea.performance_prediction) {
    const predictions = Object.entries(mainIdea.performance_prediction)
      .map(([key, value]) => `• **${capitalizeFirstLetter(key.replace(/_/g, ' '))}:** ${value}`)
      .join('\n');
    
    performanceEmbed = new EmbedBuilder()
      .setColor('#32D74B') // Apple green
      .setTitle('📊 Performance Prediction')
      .setDescription(predictions);
  }
  
  // Alternative ideas embed
  let alternativeEmbed = null;
  if (responseData.video_ideas.length > 1) {
    alternativeEmbed = new EmbedBuilder()
      .setColor('#FF9F0A') // Apple orange
      .setTitle('🔍 Alternative Concepts');
    
    let alternativeContent = '';
    responseData.video_ideas.slice(1, 4).forEach((idea, index) => {
      alternativeContent += `### Option ${index + 1}: ${idea.concept}\n`;
      alternativeContent += `Hook: "${idea.hook}"\n\n`;
      
      if (idea.audience_alignment) {
        alternativeContent += `**Audience Alignment:** ${idea.audience_alignment}\n\n`;
      }
    });
    
    alternativeEmbed.setDescription(alternativeContent);
  }
  
  // Implementation guidance embed
  let guidanceEmbed = null;
  if (responseData.implementation_guidance) {
    const guidance = responseData.implementation_guidance;
    
    let guidanceContent = `**Recommended Concept:** ${guidance.recommended_concept}\n`;
    guidanceContent += `**Reasoning:** ${guidance.reasoning}\n\n`;
    
    if (guidance.execution_tips && guidance.execution_tips.length > 0) {
      guidanceContent += `**Execution Tips:**\n`;
      guidanceContent += guidance.execution_tips.map(tip => `• ${tip}`).join('\n');
    }
    
    guidanceEmbed = new EmbedBuilder()
      .setColor('#5856D6') // Apple purple
      .setTitle('📋 Implementation Guidance')
      .setDescription(guidanceContent);
  }
  
  // Create embeds array and add all embeds
  const allEmbeds = [mainEmbed, featuredEmbed, ...structureEmbeds];
  if (performanceEmbed) allEmbeds.push(performanceEmbed);
  if (alternativeEmbed) allEmbeds.push(alternativeEmbed);
  if (guidanceEmbed) allEmbeds.push(guidanceEmbed);
  
  // Create buttons
  const actionRow = createActionButtons('ideas');
  const feedbackRow = createFeedbackButtons();
  
  return { embeds: allEmbeds, components: [actionRow, feedbackRow] };
}

/**
 * Enhanced function to create ideas card with DALL-E generated images
 */
async function createIdeasCardWithImages(name, responseData, productName) {
  // First create the basic ideas card
  const basicCard = createIdeasCard(name, responseData, productName);
  
  // Check if we should generate images
  if (!GENERATE_IMAGES) {
    return basicCard;
  }
  
  try {
    // Prepare attachments array
    const attachments = [];
    
    // Main idea concept - generate hero image
    if (responseData.video_ideas && responseData.video_ideas.length > 0) {
      const mainIdea = responseData.video_ideas[0];
      
      const conceptPrompt = generateDallEPrompt(
        { 
          script: mainIdea.hook, 
          visual_direction: mainIdea.key_visuals ? mainIdea.key_visuals[0] : null 
        }, 
        productName,
        "tiktok"
      );
      
      const conceptImagePath = await generateImageWithDallE(
        conceptPrompt, 
        `idea_concept_${Date.now()}`
      );
      
      if (conceptImagePath) {
        const conceptAttachment = new AttachmentBuilder(conceptImagePath)
          .setName('concept_image.png')
          .setDescription('Visual representation of your featured concept');
        
        attachments.push(conceptAttachment);
        
        // Find the featured concept embed (usually at index 1, after main card)
        if (basicCard.embeds.length > 1) {
          basicCard.embeds[1].setImage('attachment://concept_image.png');
        }
      }
      
      // Generate scene images (if structure exists)
      if (mainIdea.structure && mainIdea.structure.length > 0) {
        // Limit to 2 scene images max (first and last scene)
        const scenesToVisualize = mainIdea.structure.length > 2 ?
          [0, mainIdea.structure.length - 1] : // First and last if more than 2
          [0]; // Otherwise just the first scene
        
        for (const sceneIndex of scenesToVisualize) {
          if (attachments.length >= MAX_IMAGES_PER_REQUEST) break;
          
          const scenePrompt = generateDallEPrompt(
            { 
              script: mainIdea.structure[sceneIndex],
              visual_direction: mainIdea.key_visuals ? 
                mainIdea.key_visuals[sceneIndex % mainIdea.key_visuals.length] : null
            }, 
            productName,
            "tiktok"
          );
          
          const sceneImagePath = await generateImageWithDallE(
            scenePrompt, 
            `idea_scene_${sceneIndex}_${Date.now()}`
          );
          
          if (sceneImagePath) {
            const sceneAttachment = new AttachmentBuilder(sceneImagePath)
              .setName(`scene_${sceneIndex}_image.png`)
              .setDescription(`Visual for Scene ${sceneIndex + 1}`);
            
            attachments.push(sceneAttachment);
            
            // Find the corresponding scene embed
            // Main card at 0, featured concept at 1, scenes start at 2
            const embedIndex = 2 + sceneIndex;
            
            if (basicCard.embeds.length > embedIndex) {
              basicCard.embeds[embedIndex].setImage(`attachment://scene_${sceneIndex}_image.png`);
            }
          }
        }
      }
    }
    
    // Add attachments to the response
    if (attachments.length > 0) {
      basicCard.files = attachments;
    }
    
    return basicCard;
  } catch (error) {
    console.error('Error creating ideas card with images:', error);
    // Return the basic card without images if there's an error
    return basicCard;
  }
}

// Create specialized card for fix response
function createFixCard(name, responseData, productName) {
  const colors = COLOR_THEMES['fix'];
  
  // Main embed with overview
  const mainEmbed = createBrandedHeader(name, 'fix', productName);
  
  // Add personalization if available
  if (responseData.creator_personalization) {
    const personalInsight = responseData.creator_personalization;
    if (personalInsight.content_style) {
      mainEmbed.addFields({ 
        name: '✨ Your Content Strength', 
        value: personalInsight.content_style
      });
    }
    
    if (personalInsight.success_pattern) {
      mainEmbed.addFields({ 
        name: '📈 Your Success Pattern', 
        value: personalInsight.success_pattern
      });
    }
  }
  
  // Add performance metrics
  if (responseData.metadata && responseData.metadata.potential_performance) {
    const current = responseData.metadata.original_video_metrics;
    const potential = responseData.metadata.potential_performance;
    
    let performanceText = '**Current vs Potential Performance:**\n';
    
    if (current.estimated_watch_time && potential.estimated_watch_time) {
      performanceText += `Watch Time: ${current.estimated_watch_time} → ${potential.estimated_watch_time}\n`;
    }
    
    if (current.estimated_engagement_rate && potential.estimated_engagement_rate) {
      performanceText += `Engagement Rate: ${current.estimated_engagement_rate} → ${potential.estimated_engagement_rate}\n`;
    }
    
    if (current.conversion_rate && potential.conversion_rate) {
      performanceText += `Conversion: ${current.conversion_rate} → ${potential.conversion_rate}\n`;
    }
    
    mainEmbed.addFields({ 
      name: '📊 Performance Impact', 
      value: performanceText
    });
  }
  
  // Hook revision embed
  const hookRevision = responseData.improvement_plan.hook_revision;
  const hookEmbed = new EmbedBuilder()
    .setColor(colors[0])
    .setTitle('🪝 Hook Improvement')
    .setDescription(
      `**Original:**\n"${hookRevision.original}"\n\n` +
      `**Improved:**\n"${hookRevision.improved}"\n\n` +
      `**Explanation:**\n${hookRevision.explanation}`
    );
  
  if (hookRevision.impact_prediction) {
    hookEmbed.addFields({ 
      name: '📈 Expected Impact', 
      value: hookRevision.impact_prediction
    });
  }
  
  // Structure improvements embeds
  const structureEmbeds = responseData.improvement_plan.structure_improvements.map((improvement, index) => {
    const improvementEmbed = new EmbedBuilder()
      .setColor(colors[(index + 1) % colors.length])
      .setTitle(`🔧 Structure Fix ${index + 1}`);
    
    let description = `**Issue:** ${improvement.issue}\n\n`;
    description += `**Fix:** ${improvement.fix}\n\n`;
    description += `**Example:** ${improvement.example}`;
    
    improvementEmbed.setDescription(description);
    
    if (improvement.impact_prediction) {
      improvementEmbed.addFields({ 
        name: '📈 Expected Impact', 
        value: improvement.impact_prediction 
      });
    }
    
    if (improvement.visual_direction) {
      improvementEmbed.addFields({ 
        name: '🎬 Visual Direction', 
        value: improvement.visual_direction 
      });
    }
    
    return improvementEmbed;
  });
  
  // CTA improvements
  const ctaEmbed = new EmbedBuilder()
    .setColor(colors[0])
    .setTitle('🔗 Call-to-Action Improvement')
    .setDescription(
      `**Original:**\n"${responseData.improvement_plan.cta_improvements.original}"\n\n` +
      `**Improved:**\n"${responseData.improvement_plan.cta_improvements.improved}"\n\n` +
      `**Explanation:**\n${responseData.improvement_plan.cta_improvements.explanation || "More engaging and action-oriented"}`
    );
  
  if (responseData.improvement_plan.cta_improvements.impact_prediction) {
    ctaEmbed.addFields({ 
      name: '📈 Expected Impact', 
      value: responseData.improvement_plan.cta_improvements.impact_prediction 
    });
  }
  
  // Revised script embed
  const scriptEmbed = new EmbedBuilder()
    .setColor('#5856D6') // Apple purple
    .setTitle('📝 Revised Script')
    .setDescription(responseData.revised_script);
  
  // Success metrics embed
  let metricsEmbed = null;
  if (responseData.success_metrics) {
    const metrics = responseData.success_metrics;
    
    let metricsText = `**${metrics.expected_improvement}**\n\n`;
    metricsText += `**Primary Impact:** ${metrics.primary_indicator}\n\n`;
    
    if (metrics.secondary_indicators) {
      metricsText += `**Secondary Indicators:**\n`;
      metricsText += metrics.secondary_indicators.map(indicator => `• ${indicator}`).join('\n');
    }
    
    metricsEmbed = new EmbedBuilder()
      .setColor('#32D74B') // Apple green
      .setTitle('📊 Success Metrics')
      .setDescription(metricsText);
  }
  
  // Create embeds array and add all embeds
  const allEmbeds = [mainEmbed, hookEmbed, ...structureEmbeds, ctaEmbed, scriptEmbed];
  if (metricsEmbed) allEmbeds.push(metricsEmbed);
  
  // Create buttons
  const actionRow = createActionButtons('fix');
  const feedbackRow = createFeedbackButtons();
  
  return { embeds: allEmbeds, components: [actionRow, feedbackRow] };
}

// Create specialized card for ready-to-shoot response
function createReadyCard(name, responseData, productName) {
  const colors = COLOR_THEMES['ready'];
  
  // Main embed with overview
  const mainEmbed = createBrandedHeader(name, 'ready', productName);
  
  // Add personalization if available
  if (responseData.creator_personalization) {
    const personalInsight = responseData.creator_personalization;
    if (personalInsight.content_style) {
      mainEmbed.addFields({ 
        name: '✨ Your Content Style', 
        value: personalInsight.content_style
      });
    }
    
    if (personalInsight.audience_insight) {
      mainEmbed.addFields({ 
        name: '👥 Audience Insight', 
        value: personalInsight.audience_insight
      });
    }
  }
  
  // Add concept overview
  if (responseData.production_package && responseData.production_package.concept_overview) {
    mainEmbed.addFields({ 
      name: '💡 Concept Overview', 
      value: responseData.production_package.concept_overview
    });
  }
  
  // Hook options embed
  const hookEmbed = new EmbedBuilder()
    .setColor(colors[0])
    .setTitle('🪝 Recommended Hook')
    .setDescription(`"${responseData.production_package.hook_options[0].text}"`);
  
  if (responseData.production_package.hook_options[0].audience_alignment) {
    hookEmbed.addFields({ 
      name: '👥 Audience Alignment', 
      value: responseData.production_package.hook_options[0].audience_alignment
    });
  }
  
  if (responseData.production_package.hook_options[0].visual_direction) {
    hookEmbed.addFields({ 
      name: '🎬 Visual Direction', 
      value: responseData.production_package.hook_options[0].visual_direction
    });
  }
  
  // Shot list embeds - create embeds for key shots
  const shotEmbeds = responseData.production_package.shot_list.slice(0, 5).map((shot, index) => {
    const shotEmbed = new EmbedBuilder()
      .setColor(colors[index % colors.length])
      .setTitle(`🎬 Shot ${shot.shot_number}`);
    
    let description = `**Description:** ${shot.description}\n`;
    description += `**Duration:** ${shot.duration}\n`;
    description += `**Camera:** ${shot.camera_angle}\n`;
    
    if (shot.on_screen_text) {
      description += `**Text:** ${shot.on_screen_text}\n`;
    }
    
    shotEmbed.setDescription(description);
    
    // Add performance note if available
    if (shot.performance_note) {
      shotEmbed.addFields({ 
        name: '📊 Performance Note', 
        value: shot.performance_note
      });
    }
    
    return shotEmbed;
  });
  
  // Script embed
  const scriptContent = responseData.production_package.script;
  let scriptText = '';
  
  if (scriptContent.hook) {
    scriptText += `**Hook:** "${scriptContent.hook}"\n\n`;
  }
  
  if (scriptContent.body) {
    scriptText += `**Body:** "${scriptContent.body}"`;
  }
  
  const scriptEmbed = new EmbedBuilder()
    .setColor('#5856D6') // Apple purple
    .setTitle('📝 Complete Script')
    .setDescription(scriptText);
  
  // Technical recommendations embed
  let techEmbed = null;
  if (responseData.production_package.technical_recommendations) {
    const tech = responseData.production_package.technical_recommendations;
    
    let techText = '';
    Object.entries(tech).forEach(([key, value]) => {
      techText += `• **${capitalizeFirstLetter(key)}:** ${value}\n`;
    });
    
    techEmbed = new EmbedBuilder()
      .setColor('#64D2FF') // Apple light blue
      .setTitle('🔧 Technical Tips')
      .setDescription(techText);
  }
  
  // Success factors embed
  let successEmbed = null;
  if (responseData.success_factors && responseData.success_factors.length > 0) {
    successEmbed = new EmbedBuilder()
      .setColor('#32D74B') // Apple green
      .setTitle('🏆 Why This Will Perform Well')
      .setDescription(responseData.success_factors.map(factor => `• ${factor}`).join('\n'));
  }
  
  // Create embeds array and add all embeds
  const allEmbeds = [mainEmbed, hookEmbed, ...shotEmbeds, scriptEmbed];
  if (techEmbed) allEmbeds.push(techEmbed);
  if (successEmbed) allEmbeds.push(successEmbed);
  
  // Create buttons
  const actionRow = createActionButtons('ready');
  const feedbackRow = createFeedbackButtons();
  
  return { embeds: allEmbeds, components: [actionRow, feedbackRow] };
}

// Create specialized card for analysis response
function createAnalysisCard(name, responseData) {
  const colors = COLOR_THEMES['analyze'];
  
  // Main embed with overview
  const mainEmbed = createBrandedHeader(name, 'analyze', "your content");
  
  // Add personalization if available
  if (responseData.creator_personalization) {
    const personalInsight = responseData.creator_personalization;
    
    if (personalInsight.content_style) {
      mainEmbed.addFields({ 
        name: '✨ Your Content Style', 
        value: personalInsight.content_style
      });
    }
    
    if (personalInsight.competitive_edge) {
      mainEmbed.addFields({ 
        name: '🏆 Your Competitive Edge', 
        value: personalInsight.competitive_edge
      });
    }
  }
  
  // Performance summary embed
  const performanceEmbed = new EmbedBuilder()
    .setColor(colors[0])
    .setTitle('📊 Performance Overview');
  
  if (responseData.performance_summary) {
    const summary = responseData.performance_summary;
    
    let performanceText = `**Overall Score:** ${summary.overall_score}/10\n`;
    performanceText += `**Potential Improvement:** ${summary.potential_improvement}\n`;
    performanceText += `**Strongest Element:** ${summary.strongest_element}\n`;
    performanceText += `**Focus Area:** ${summary.focus_area}`;
    
    performanceEmbed.setDescription(performanceText);
  }
  
  // Create benchmark embeds
  const benchmarkEmbeds = [];
  
  if (responseData.benchmark_data) {
    // Voice & Delivery
    if (responseData.benchmark_data.voice_delivery) {
      const voiceData = responseData.benchmark_data.voice_delivery;
      
      const voiceEmbed = new EmbedBuilder()
        .setColor(colors[1])
        .setTitle('🎤 Voice & Delivery');
      
      let voiceText = `**Your Score:** ${voiceData.your_score}/10 `;
      voiceText += `(${getScoreEmoji(voiceData.your_score)} ${getScoreWord(voiceData.your_score)})\n`;
      voiceText += `**Industry Average:** ${voiceData.industry_avg}/10\n`;
      voiceText += `**Percentile:** ${voiceData.percentile}%\n\n`;
      
      voiceText += `**Strengths:**\n`;
      voiceText += voiceData.strengths.map(strength => `• ${strength}`).join('\n');
      voiceText += `\n\n**Opportunities:**\n`;
      voiceText += voiceData.opportunities.map(opp => `• ${opp}`).join('\n');
      
      voiceEmbed.setDescription(voiceText);
      benchmarkEmbeds.push(voiceEmbed);
    }
    
    // Hook
    if (responseData.benchmark_data.hook) {
      const hookData = responseData.benchmark_data.hook;
      
      const hookEmbed = new EmbedBuilder()
        .setColor(colors[2])
        .setTitle('🪝 Hook');
      
      let hookText = `**Your Score:** ${hookData.your_score}/10 `;
      hookText += `(${getScoreEmoji(hookData.your_score)} ${getScoreWord(hookData.your_score)})\n`;
      hookText += `**Industry Average:** ${hookData.industry_avg}/10\n`;
      hookText += `**Percentile:** ${hookData.percentile}%\n\n`;
      
      hookText += `**Strengths:**\n`;
      hookText += hookData.strengths.map(strength => `• ${strength}`).join('\n');
      hookText += `\n\n**Opportunities:**\n`;
      hookText += hookData.opportunities.map(opp => `• ${opp}`).join('\n');
      
      hookEmbed.setDescription(hookText);
      benchmarkEmbeds.push(hookEmbed);
    }
    
    // Add other benchmark sections if needed
  }
  
  // Audience insights embed
  let audienceEmbed = null;
  if (responseData.audience_specific_insights && responseData.audience_specific_insights.length > 0) {
    audienceEmbed = new EmbedBuilder()
      .setColor('#FF9F0A') // Apple orange
      .setTitle('👥 Your Audience Insights')
      .setDescription(responseData.audience_specific_insights.map(insight => `• ${insight}`).join('\n'));
  }
  
  // Next steps embed
  let nextStepsEmbed = null;
  if (responseData.performance_summary && responseData.performance_summary.focus_area) {
    const focusArea = responseData.performance_summary.focus_area;
    
    // Find the relevant benchmark data for the focus area
    let focusAreaData = null;
    if (focusArea.toLowerCase().includes('hook') && responseData.benchmark_data.hook) {
      focusAreaData = responseData.benchmark_data.hook;
    } else if (focusArea.toLowerCase().includes('voice') && responseData.benchmark_data.voice_delivery) {
      focusAreaData = responseData.benchmark_data.voice_delivery;
    }
    // Add other focus areas as needed
    
    let nextStepsText = `Focus first on enhancing your **${focusArea}** with these specific recommendations:\n\n`;
    
    if (focusAreaData && focusAreaData.opportunities) {
      nextStepsText += focusAreaData.opportunities.map((opp, i) => `${i+1}. ${opp}`).join('\n');
    } else {
      nextStepsText += "• Implement the opportunities noted in your focus area section.";
    }
    
    nextStepsEmbed = new EmbedBuilder()
      .setColor('#32D74B') // Apple green
      .setTitle('🚀 Next Steps')
      .setDescription(nextStepsText);
  }
  
  // Create embeds array and add all embeds
  const allEmbeds = [mainEmbed, performanceEmbed, ...benchmarkEmbeds];
  if (audienceEmbed) allEmbeds.push(audienceEmbed);
  if (nextStepsEmbed) allEmbeds.push(nextStepsEmbed);
  
  // Create buttons
  const actionRow = createActionButtons('analyze');
  const feedbackRow = createFeedbackButtons();
  
  return { embeds: allEmbeds, components: [actionRow, feedbackRow] };
}

// Function to generate content based on intent using JSON files
async function generateContentForIntent(intent, brief, creatorHandle, focus = null) {
  try {
    // Read the response data from appropriate JSON file
    const responseData = readResponseFile(intent);
    
    // Get product name from brief
    const productName = extractProductName(brief);
    
    // Replace any handle placeholders with the actual creator handle
    if (responseData.creator_personalization && responseData.creator_personalization.handle_reference) {
      responseData.creator_personalization.handle_reference = 
        responseData.creator_personalization.handle_reference.replace('{handle}', creatorHandle || 'your handle');
    }
    
    // Generate the appropriate card based on intent
    let response;
    
    switch(intent) {
      case 'hook':
        response = createHookCard(creatorHandle || 'Creator', responseData, productName);
        break;
        
      case 'script':
        // Use the enhanced version with images
        response = await createScriptCardWithImages(creatorHandle || 'Creator', responseData, productName);
        break;
        
      case 'story':
        response = createStoryCard(creatorHandle || 'Creator', responseData, productName);
        break;
        
      case 'ideas':
        // Use the enhanced version with images
        response = await createIdeasCardWithImages(creatorHandle || 'Creator', responseData, productName);
        break;
        
      case 'fix':
        response = createFixCard(creatorHandle || 'Creator', responseData, productName);
        break;
        
      case 'ready':
        response = createReadyCard(creatorHandle || 'Creator', responseData, productName);
        break;
        
      case 'analyze':
        response = createAnalysisCard(creatorHandle || 'Creator', responseData);
        break;
        
      default:
        throw new Error(`Could not generate content for unknown intent: ${intent}`);
    }
    
    // Return both the response and the raw response data
    return {
      response: response,
      responseData: responseData
    };
  } catch (error) {
    console.error(`Error generating ${intent} content:`, error);
    
    // Create a simple error embed
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF3B30') // Apple red
      .setTitle('❌ Error Generating Content')
      .setDescription(`Failed to generate ${intent} content. Please try again later.\n\nError details: ${error.message}`)
      .setFooter({ 
        text: 'Influenxers AI • Your Creator Success Coach', 
        iconURL: 'https://cdn-icons-png.flaticon.com/512/6828/6828736.png' 
      });
    
    return {
      response: { embeds: [errorEmbed], components: [] },
      responseData: null
    };
  }
}

// Function to analyze videos
async function analyzeVideo(videoUrl, brief, creatorHandle) {
  try {
    // Read from the analysis JSON file
    const responseData = readResponseFile('analyze');
    
    // Replace any handle placeholders
    if (responseData.creator_personalization && responseData.creator_personalization.handle_reference) {
      responseData.creator_personalization.handle_reference = 
        responseData.creator_personalization.handle_reference.replace('{handle}', creatorHandle || 'your handle');
    }
    
    // Generate a full analysis card
    const analysisCard = createAnalysisCard(creatorHandle || 'Creator', responseData);
    
    return {
      response: analysisCard,
      responseData: responseData
    };
  } catch (error) {
    console.error(`Error analyzing video:`, error);
    
    // Create a simple error embed
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF3B30') // Apple red
      .setTitle('❌ Error Analyzing Video')
      .setDescription(`Failed to analyze the video. Please try again later.\n\nError details: ${error.message}`)
      .setFooter({ 
        text: 'Influenxers AI • Your Creator Success Coach', 
        iconURL: 'https://cdn-icons-png.flaticon.com/512/6828/6828736.png' 
      });
    
    return {
      response: { embeds: [errorEmbed], components: [] },
      responseData: { error: "Analysis failed" }
    };
  }
}

// Function to detect intent from message content
function detectIntent(text) {
  // Normalize text for case-insensitive matching
  const normalizedText = text.toLowerCase();
  
  // Check for update requests first
  if (/update\s+(my)?\s*(tiktok|ig|instagram|product|brief)/i.test(normalizedText)) {
    return 'update';
  }
  
  // Check for analyze intent
  if (/analyze|analysis|evaluate|review|score|rate/i.test(normalizedText)) {
    return 'analyze';
  }
  
  // Then check for content generation intents
  if (normalizedText.includes('hook')) return 'hook';
  if (normalizedText.includes('script') || normalizedText.includes('brief')) return 'script';
  if (normalizedText.includes('story')) return 'story';
  if (normalizedText.includes('idea')) return 'ideas';
  if (normalizedText.includes('fix') || normalizedText.includes('flop')) return 'fix';
  if (normalizedText.includes('ready')) return 'ready';
  if (/my info|profile|what do you know|my data|saved info/i.test(normalizedText)) {
    return 'profile';
  }
  
  return null;
}

// Helper function to determine what to update based on message content
function detectUpdateType(text) {
  const normalizedText = text.toLowerCase();
  
  if (normalizedText.includes('tiktok')) return 'tiktokHandle';
  if (normalizedText.includes('instagram') || normalizedText.includes('ig')) return 'instagramHandle';
  if (normalizedText.includes('product') || normalizedText.includes('brief')) return 'brief';
  
  return null;
}

// Main message handler
client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;
  
  // Check if it's a DM or if the bot is mentioned
  const isDM = !message.guild;
  const botMentioned = message.mentions.users.has(client.user.id);
  
  // Only respond in DMs or when mentioned or in allowed channels
  const allowedChannelIds = process.env.DISCORD_CHANNEL_ID ? [process.env.DISCORD_CHANNEL_ID] : []; 
  if (!isDM && !botMentioned && !allowedChannelIds.includes(message.channel.id)) return;
  
  // Log the incoming message
  console.log(`Received message: ${message.content}`);
  
  try {
    // Process the message content (remove the bot mention if present)
    let content = message.content;
    if (botMentioned) {
      content = content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    }
    
    // Detect intent from message
    const intent = detectIntent(content);
    console.log(`Detected intent: ${intent || 'none'}`);
    
    // Get user session data
    const userId = message.author.id;
    if (!sessionState[userId]) {
      sessionState[userId] = {
        tiktokHandle: message.author.username,
        brief: '',
        lastInteraction: Date.now()
      };
      saveSessions();
    }
    
    const sessionData = sessionState[userId];
    const creatorHandle = sessionData.tiktokHandle || message.author.username;
    
    // Update last interaction time
    sessionState[userId].lastInteraction = Date.now();
    if (intent) {
      sessionState[userId].lastIntent = intent;
    }
    saveSessions();
    
    // Handle update intent
    if (intent === 'update') {
      const updateType = detectUpdateType(content);
      
      if (updateType) {
        // Extract the value to update from the message
        const valueMatch = content.match(/update\s+(?:my)?\s*(?:tiktok|ig|instagram|product|brief)(?:\s+(?:to|with|as))?\s+(.+)/i);
        const newValue = valueMatch ? valueMatch[1].trim() : '';
        
        if (newValue) {
          // Update the session data
          sessionState[userId][updateType] = newValue;
          saveSessions();
          
          await message.reply(`✅ Updated your ${updateType} to: ${newValue}`);
        } else {
          await message.reply("❓ Please provide a value to update. For example: 'Update my TikTok handle to @myhandle'");
        }
      } else {
        await message.reply("❓ Not sure what you want to update. You can update your TikTok handle, Instagram handle, or product brief.");
      }
      return;
    }
    
    // Send a typing indicator while generating response
    await message.channel.sendTyping();
    
    if (intent === 'analyze') {
      // Extract video URL from the message
      const urlMatch = content.match(/https?:\/\/[^\s]+/);
      const videoUrl = urlMatch ? urlMatch[0] : '';
      
      if (!videoUrl) {
        await message.reply("❓ Please provide a video URL for me to analyze. For example: 'Analyze this video: https://tiktok.com/...'");
        return;
      }
      
      const result = await analyzeVideo(videoUrl, sessionData.brief, creatorHandle);
      await message.reply(result.response);
    } else if (intent === 'profile') {
      const embed = new EmbedBuilder()
        .setColor('#5AC8FA') // Apple blue
        .setTitle(`👤 Your Creator Profile`)
        .setDescription("Here's what I've saved about you:")
        .addFields(
          { name: '📱 TikTok Handle', value: sessionData.tiktokHandle || 'Not set', inline: true },
          { name: '📸 Instagram Handle', value: sessionData.instagramHandle || 'Not set', inline: true },
          { name: '📄 Product Brief', value: sessionData.brief ? '✅ Saved' : 'Not provided', inline: true },
          { name: '🧠 Last Intent', value: sessionData.lastIntent || 'None yet', inline: true }
        )
        .setFooter({
          text: 'Influenxers AI • Your Creator Success Coach',
          iconURL: 'https://cdn-icons-png.flaticon.com/512/6828/6828736.png'
        });
    
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('update_info')
          .setLabel('Update Info')
          .setStyle(ButtonStyle.Primary)
      );
    
      await message.reply({ embeds: [embed], components: [row] });
      return;
    } else if (intent) {
      // Generate content based on intent
      const result = await generateContentForIntent(intent, sessionData.brief, creatorHandle);
      await message.reply(result.response);
    } else {
      // No specific intent detected, send welcome/help message
      const helpEmbed = new EmbedBuilder()
        .setColor('#147EFB') // Apple blue
        .setTitle('👋 Hi there! I\'m your Creator Success Coach')
        .setDescription(
          "I can help you create viral content that converts! Here's what you can ask me to do:"
        )
        .addFields(
          { name: '🪝 Hook', value: 'Generate attention-grabbing hooks', inline: true },
          { name: '📝 Script', value: 'Create a full video script', inline: true },
          { name: '📖 Story', value: 'Craft a story-driven script', inline: true },
          { name: '💡 Ideas', value: 'Generate video concept ideas', inline: true },
          { name: '🔧 Fix', value: 'Improve your existing video', inline: true },
          { name: '🎬 Ready', value: 'Get a ready-to-shoot package', inline: true },
          { name: '📊 Analyze', value: 'Analyze your video performance', inline: true }
        )
        .setFooter({ 
          text: 'Influenxers AI • Your Creator Success Coach', 
          iconURL: 'https://cdn-icons-png.flaticon.com/512/6828/6828736.png' 
        });
        
      const exampleRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('example_hook')
            .setLabel('Example: Generate a Hook')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('example_script')
            .setLabel('Example: Create a Script')
            .setStyle(ButtonStyle.Primary)
        );
        
      await message.reply({ embeds: [helpEmbed], components: [exampleRow] });
    }
  } catch (error) {
    console.error('Error processing message:', error);
    await message.reply(`❌ Sorry, I encountered an error: ${error.message}. Please try again later.`);
  }
});

// Button interaction handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  
  try {
    const customId = interaction.customId;
    console.log(`Button clicked: ${customId}`);
    
    // Examples buttons
    if (customId.startsWith('example_')) {
      const exampleType = customId.replace('example_', '');
      const userId = interaction.user.id;
      const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
      
      // Defer the reply to buy time
      await interaction.deferReply();
      
      // Generate example content
      const result = await generateContentForIntent(exampleType, sessionData.brief, sessionData.tiktokHandle);
      await interaction.editReply(result.response);
      return;
    }
    
    // Update info button
    if (customId === 'update_info') {
      const updateEmbed = new EmbedBuilder()
        .setColor('#5AC8FA')
        .setTitle('✏️ Update Your Profile')
        .setDescription('You can update your information with these commands:')
        .addFields(
          { name: 'TikTok Handle', value: 'Type: `update my tiktok to @yourhandle`', inline: false },
          { name: 'Instagram Handle', value: 'Type: `update my instagram to @yourhandle`', inline: false },
          { name: 'Product Brief', value: 'Type: `update my brief to [your product description]`', inline: false }
        );
      
      await interaction.reply({ embeds: [updateEmbed], ephemeral: true });
      return;
    }
    
    // Handle feedback buttons
    if (customId.startsWith('feedback_')) {
      const feedbackType = customId.replace('feedback_', '');
      
      let responseMessage = '';
      switch(feedbackType) {
        case 'love':
          responseMessage = "❤️ I'm so glad you loved it! Your feedback helps me improve.";
          break;
        case 'meh':
          responseMessage = "😐 Thanks for your honest feedback. I'll work on making this better.";
          break;
        case 'help':
          responseMessage = "🆘 I'm here to help! Please tell me what you need assistance with.";
          break;
      }
      
      await interaction.reply({ content: responseMessage, ephemeral: true });
      return;
    }
    
    // Handle intent-specific buttons
    switch(customId) {
      case 'more_hooks':
        await interaction.reply({ content: "🔄 Generating more hook options for you...", ephemeral: true });
        
        // In a real implementation, this would generate new hooks
        // For now, just simulate a delay
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          
          const result = await generateContentForIntent('hook', sessionData.brief, sessionData.tiktokHandle);
          
          // Create a new message with the new hooks
          await interaction.channel.send(result.response);
        }, 2000);
        break;
        
      case 'creator_focus':
        await interaction.reply({ 
          content: "✏️ Adjusting the content to focus more on your unique creator style...", 
          ephemeral: true 
        });
        
        // In a real implementation, this would regenerate with more creator focus
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          
          // In a real implementation, we'd pass a focus parameter
          const result = await generateContentForIntent('hook', sessionData.brief, sessionData.tiktokHandle, 'creator');
          
          await interaction.channel.send(result.response);
        }, 2000);
        break;
      
      case 'save_hook':
      case 'save_script':
      case 'save_story':
      case 'save_idea':
      case 'save_fixes':
      case 'save_analysis':
        await interaction.reply({ 
          content: "💾 I've saved this to your favorites! You can access it anytime from your dashboard.", 
          ephemeral: true 
        });
        break;
        
      // More script-specific buttons
      case 'refine_script':
        await interaction.reply({ 
          content: "✏️ Refining your script with more audience-focused messaging...", 
          ephemeral: true 
        });
        
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          const result = await generateContentForIntent('script', sessionData.brief, sessionData.tiktokHandle, 'refine');
          await interaction.channel.send(result.response);
        }, 2000);
        break;
        
      case 'add_visuals':
        await interaction.reply({
          content: "🎨 Adding more detailed visual notes to your script...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          const result = await generateContentForIntent('script', sessionData.brief, sessionData.tiktokHandle, 'visual');
          await interaction.channel.send(result.response);
        }, 2000);
        break;
      
      // More story-specific buttons
      case 'more_emotional':
        await interaction.reply({
          content: "❤️ Making your story more emotional and impactful...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          const result = await generateContentForIntent('story', sessionData.brief, sessionData.tiktokHandle, 'emotional');
          await interaction.channel.send(result.response);
        }, 2000);
        break;
        
      case 'more_authentic':
        await interaction.reply({
          content: "✅ Enhancing your story's authenticity...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          const result = await generateContentForIntent('story', sessionData.brief, sessionData.tiktokHandle, 'authentic');
          await interaction.channel.send(result.response);
        }, 2000);
        break;
        
      // More ideas-specific buttons
      case 'more_ideas':
        await interaction.reply({
          content: "🔄 Generating more creative video ideas...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          const result = await generateContentForIntent('ideas', sessionData.brief, sessionData.tiktokHandle);
          await interaction.channel.send(result.response);
        }, 2000);
        break;
        
      case 'trending_ideas':
        await interaction.reply({
          content: "📈 Finding trending content ideas for your niche...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          const result = await generateContentForIntent('ideas', sessionData.brief, sessionData.tiktokHandle, 'trending');
          await interaction.channel.send(result.response);
        }, 2000);
        break;
        
      // Fix-specific buttons
      case 'apply_fixes':
        await interaction.reply({
          content: "🛠️ Applying all suggested fixes to your video...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          await interaction.channel.send({
            content: "✅ All fixes have been applied to your video! You can now download the improved version from your dashboard."
          });
        }, 3000);
        break;
        
      case 'explain_more':
        await interaction.reply({
          content: "❓ Providing more detailed explanations of the suggested fixes...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          const result = await generateContentForIntent('fix', sessionData.brief, sessionData.tiktokHandle, 'detailed');
          await interaction.channel.send(result.response);
        }, 2000);
        break;
        
      // Ready-specific buttons
      case 'download_package':
        await interaction.reply({
          content: "📥 Preparing your ready-to-shoot package for download...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          await interaction.channel.send({
            content: "✅ Your ready-to-shoot package has been prepared! You can download it from your dashboard."
          });
        }, 2000);
        break;
        
      case 'refine_shots':
        await interaction.reply({
          content: "🎯 Refining your shot list for optimal performance...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          const result = await generateContentForIntent('ready', sessionData.brief, sessionData.tiktokHandle, 'refined');
          await interaction.channel.send(result.response);
        }, 2000);
        break;
        
      case 'calendar_add':
        await interaction.reply({
          content: "📅 Adding this shoot to your content calendar...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          await interaction.channel.send({
            content: "✅ Added to your content calendar for next week! You'll receive reminders 2 days before the shoot."
          });
        }, 1500);
        break;
        
      // Analysis-specific buttons
      case 'deep_insights':
        await interaction.reply({
          content: "🔍 Generating deeper insights from your video analysis...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          const result = await generateContentForIntent('analyze', sessionData.brief, sessionData.tiktokHandle, 'deep');
          await interaction.channel.send(result.response);
        }, 3000);
        break;
        
      case 'fix_issues':
        await interaction.reply({
          content: "🔧 Creating a fix plan for the identified issues...",
          ephemeral: true
        });
        
        setTimeout(async () => {
          const userId = interaction.user.id;
          const sessionData = sessionState[userId] || { tiktokHandle: interaction.user.username, brief: '' };
          const result = await generateContentForIntent('fix', sessionData.brief, sessionData.tiktokHandle);
          await interaction.channel.send(result.response);
        }, 2500);
        break;
        
      // Default case for any other buttons
      default:
        await interaction.reply({ 
          content: "✅ Your request has been received! I'll have that ready for you shortly.", 
          ephemeral: true 
        });
    }
  } catch (error) {
    console.error('Error handling button interaction:', error);
    await interaction.reply({ 
      content: `Sorry, I encountered an error: ${error.message}. Please try again.`, 
      ephemeral: true 
    });
  }
});

// Add a periodic cleanup function for older generated images
function cleanupOldImages() {
  try {
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    
    const files = fs.readdirSync(IMAGE_FOLDER);
    let count = 0;
    
    for (const file of files) {
      const filePath = path.join(IMAGE_FOLDER, file);
      const stats = fs.statSync(filePath);
      
      // Delete files older than 1 day
      if (now - stats.mtimeMs > ONE_DAY) {
        fs.unlinkSync(filePath);
        count++;
      }
    }
    
    if (count > 0) {
      console.log(`Cleaned up ${count} old image files`);
    }
  } catch (error) {
    console.error('Error cleaning up old images:', error);
  }
}

// Periodic save of session data
setInterval(() => {
  saveSessions();
}, 5 * 60 * 1000); // Save every 5 minutes

// Clean up old sessions
function cleanupOldSessions() {
  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  
  let count = 0;
  for (const userId in sessionState) {
    if (sessionState[userId].lastInteraction && now - sessionState[userId].lastInteraction > ONE_WEEK) {
      delete sessionState[userId];
      count++;
    }
  }
  
  if (count > 0) {
    console.log(`Cleaned up ${count} old sessions`);
    saveSessions();
  }
}

// Run cleanup daily
setInterval(cleanupOldSessions, 24 * 60 * 60 * 1000);
// Run image cleanup daily
setInterval(cleanupOldImages, 24 * 60 * 60 * 1000);

// Error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Login to Discord with the bot token
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log('Bot logged in successfully');
  })
  .catch(error => {
    console.error('Failed to log in:', error);
    
    // Check if the error is related to the token
    if (error.code === 'TokenInvalid' || error.message.includes('token')) {
      console.error('\n⚠️ DISCORD_TOKEN appears to be invalid or missing!');
      console.error('Make sure you have created a .env file with a valid DISCORD_TOKEN.');
      console.error('Example .env file content:');
      console.error('DISCORD_TOKEN=your_token_here');
      console.error('API_KEY=your_openai_api_key');
    }
  });

// Export functions for potential external use
module.exports = {
  client,
  createHookCard,
  createScriptCard,
  createScriptCardWithImages,
  createStoryCard,
  createIdeasCard,
  createIdeasCardWithImages,
  createFixCard,
  createReadyCard,
  createAnalysisCard,
  generateContentForIntent,
  analyzeVideo,
  generateImageWithDallE
};